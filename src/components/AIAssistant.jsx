import React, { useState, useRef, useEffect } from 'react'
import { base44 } from '@/api/base44Client'
import { Send, X, Minimize2, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

const SYSTEM_PROMPT = `You are Jarvis — the AI assistant built into Urkel 2.0, a landscaping supply delivery system. You work for the owner and know his business inside and out.

Your personality: warm, sharp, a little dry. You talk like a knowledgeable coworker, not a help desk. You're confident, you remember context from the conversation, and you give real answers — not hedged corporate ones. Short replies unless a list is actually needed. No filler phrases like "Certainly!" or "Great question!" Just answer.

LIVE DATA is pre-loaded in your context for quick answers. But you also have SEARCH TOOLS — use them when the user asks about a specific customer, order, or load that isn't already covered.

== SEARCH TOOLS ==
When you need to look something up, output ONE of these action lines (alone on its own line). The system will run the query and give you the result, then you answer.

To find an order by customer name:
ACTION:SEARCH_ORDER:{"customer_name":"[name]"}

To find loads for a customer (optionally on a specific date):
ACTION:SEARCH_LOAD:{"customer_name":"[name]","date":"[YYYY-MM-DD or omit]"}

To find ALL loads on a specific date (no customer filter needed):
ACTION:SEARCH_LOAD:{"date":"[YYYY-MM-DD]"}

IMPORTANT: When the user asks about deliveries or who is scheduled for a specific day (e.g. "do I have deliveries Monday?", "who's coming Tuesday?", "what's going out next week?"), ALWAYS use ACTION:SEARCH_LOAD with the correct date. This searches BOTH built loads AND the delivery schedule (customers on the calendar even without a load built yet). Do NOT answer from LIVE DATA — LIVE DATA only covers today. Calculate the ISO date yourself from the full date in LIVE DATA (e.g. if today is Saturday May 9 2026, then Monday = 2026-05-11). Always pass the calculated ISO date as the "date" field.

To see all items on an order:
ACTION:GET_ORDER_ITEMS:{"customer_name":"[name]"}

To check payment/receipt status:
ACTION:GET_RECEIPT:{"customer_name":"[name]"}

Rules for using tools:
- If the user asks about a specific customer or order and the LIVE DATA does not have enough detail, USE A TOOL — do not say "I don't have that info"
- Output ONLY the ACTION line when searching — no other text on that line
- Wait for the SEARCH RESULT before answering the user
- Never make up data. If a search returns nothing, say so honestly.

== REMINDERS ==
TO SET A REMINDER — output this exact line (and nothing else on that line), then your confirmation on the next line:
ACTION:CREATE_REMINDER:{"title":"[title]","due_time":"[YYYY-MM-DDTHH:MM:SS-04:00]"}
IMPORTANT: Always use -04:00 (Eastern Daylight Time) as the timezone offset. Never omit the timezone.
Example confirmation: "Got it — I'll ping you at 2:30."

Never write code. Never write console.log(). Never write Reminder.create().`

function fuzzyMatch(name, query) {
  if (!name || !query) return false
  const n = name.toLowerCase().trim()
  const q = query.toLowerCase().trim()
  return n.includes(q) || q.includes(n) || n.includes(q.split(' ')[0]) || q.includes(n.split(' ')[0])
}

async function runSearchAction(actionType, params) {
  try {
    switch (actionType) {
      case 'SEARCH_ORDER': {
        const orders = await base44.entities.Order.list('-updated_date', 500)
        const matches = orders.filter(o => fuzzyMatch(o.company_name || o.customer_name, params.customer_name))
        if (!matches.length) return `No orders found for "${params.customer_name}".`
        return matches.slice(0, 5).map(o =>
          `Order: ${o.company_name || o.customer_name} | Status: ${o.is_archived ? 'archived' : o.is_completed ? 'completed' : o.status || 'active'} | Created: ${o.created_date?.slice(0,10)}`
        ).join('\n')
      }
      case 'SEARCH_LOAD': {
        // Query both built Loads AND DeliveryReminder schedule entries
        let loads, scheduleEntries
        if (params.date) {
          ;[loads, scheduleEntries] = await Promise.all([
            base44.entities.Load.filter({ delivery_date: params.date }, '-created_date', 200),
            base44.entities.DeliveryReminder.filter({ scheduled_date: params.date }, '-created_date', 200).catch(() => [])
          ])
        } else {
          ;[loads, scheduleEntries] = await Promise.all([
            base44.entities.Load.list('-delivery_date', 200),
            base44.entities.DeliveryReminder.list('-scheduled_date', 200).catch(() => [])
          ])
        }
        // Filter schedule entries: only unresolved ones
        const activeSchedule = (scheduleEntries || []).filter(r => !r.is_resolved)
        // Apply customer filter if provided
        const matchedLoads = params.customer_name
          ? loads.filter(l => fuzzyMatch(l.company_name || l.customer_name, params.customer_name))
          : loads
        const matchedSchedule = params.customer_name
          ? activeSchedule.filter(r => fuzzyMatch(r.customer_name, params.customer_name))
          : activeSchedule
        const loadLines = matchedLoads.slice(0, 10).map(l =>
          `[LOAD BUILT] ${l.company_name || l.customer_name} | Date: ${l.delivery_date} | Status: ${l.status} | Truck: ${l.truck_name || 'unassigned'}`
        )
        const scheduleLines = matchedSchedule.slice(0, 10).map(r =>
          `[ON SCHEDULE] ${r.customer_name || 'Unknown'} | Date: ${r.scheduled_date} | No load built yet`
        )
        const allLines = [...loadLines, ...scheduleLines]
        if (!allLines.length) return `No deliveries found${params.customer_name ? ` for "${params.customer_name}"` : ''}${params.date ? ` on ${params.date}` : ''}.`
        return allLines.join('\n')
      }
      case 'GET_ORDER_ITEMS': {
        const orders = await base44.entities.Order.list('-updated_date', 500)
        const match = orders.find(o => fuzzyMatch(o.company_name || o.customer_name, params.customer_name))
        if (!match) return `No order found for "${params.customer_name}".`
        const items = await base44.entities.OrderItem.filter({ order_id: match.id }, '-created_date', 200)
        if (!items.length) return `Order found for ${match.company_name || match.customer_name} but no items on it.`
        const itemLines = items.map(i => {
          const qty = i.quantity || 0
          const delivered = i.delivered_quantity || 0
          return `- ${i.product_name} ${i.selected_color || ''} (${i.selected_unit || i.unit_type}): qty ${qty}, delivered ${delivered}, status: ${i.status || 'pending'}`
        }).join('\n')
        return `Items for ${match.company_name || match.customer_name} (order status: ${match.is_completed ? 'completed' : match.status || 'active'}):\n${itemLines}`
      }
      case 'GET_RECEIPT': {
        const orders = await base44.entities.Order.list('-updated_date', 500)
        const match = orders.find(o => fuzzyMatch(o.company_name || o.customer_name, params.customer_name))
        if (!match) return `No order found for "${params.customer_name}".`
        const receipts = await base44.entities.Receipt.filter({ order_id: match.id }, '-created_date', 50)
        if (!receipts.length) return `No receipts found for ${match.company_name || match.customer_name}.`
        return receipts.map(r =>
          `Receipt #${r.receipt_number}: $${r.total_amount} | Paid: ${r.is_paid ? 'YES' : 'NO'} | Method: ${r.payment_method || 'unknown'} | Date: ${r.sale_date?.slice(0,10)}`
        ).join('\n')
      }
      default:
        return `Unknown search action: ${actionType}`
    }
  } catch (err) {
    return `Search failed: ${err.message}`
  }
}

export default function AIAssistant({ systemPrompt = '', briefingData = null, style = {}, onClose = () => {} }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    const dateLabel = new Date(todayStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

    const fetchBriefing = async () => {
      try {
        const [loadsRaw, deliveryRemindersRaw, remindersRaw] = await Promise.all([
          base44.entities.Load.filter({ delivery_date: todayStr }, '-created_date', 100),
          base44.entities.DeliveryReminder.filter({ scheduled_date: todayStr, is_resolved: false }, '-created_date', 100).catch(() => []),
          base44.entities.Reminder.filter({ is_completed: false, is_dismissed: false }, '-due_time', 100)
        ])

        const activeLoads = loadsRaw.filter(l => l.status !== 'archived' && l.status !== 'delivered')
        const loadNames = activeLoads.map(l => l.customer_name || l.company_name || 'Unknown')
        const drNames = (deliveryRemindersRaw || []).map(r => r.customer_name).filter(n => n && !loadNames.includes(n))
        const allDeliveries = [...loadNames, ...drNames]
        const overdueReminders = remindersRaw.filter(r => r.due_time && r.due_time.slice(0, 10) <= todayStr)

        const loadsList = allDeliveries.length ? allDeliveries.map(n => `- ${n}`).join('\n') : 'None scheduled'
        const remindersList = overdueReminders.length
          ? overdueReminders.map(r => `- ${r.title} (due ${r.due_time ? new Date(r.due_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'today'})`).join('\n')
          : 'None'

        setMessages([{ role: 'assistant', content: `Good morning! Here's your briefing for ${dateLabel}:\n\n🚛 Loads going out today:\n${loadsList}\n\n⏰ Reminders due today or overdue:\n${remindersList}` }])
      } catch (err) {
        setMessages([{ role: 'assistant', content: `Good morning! Couldn't load briefing data. Ask me anything.` }])
      }
    }

    fetchBriefing()
  }, [])

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return

    const userMessage = { role: 'user', content: inputValue }
    setMessages(prev => [...prev, userMessage])
    const currentInput = inputValue
    setInputValue('')
    setIsLoading(true)
    const loadingTimeout = setTimeout(() => setIsLoading(false), 45000)

    try {
      const recentMessages = messages.slice(-6)
      const historyStr = recentMessages
        .filter(m => m.role !== 'system')
        .map(m => `${m.role === 'user' ? 'User' : 'Jarvis'}: ${m.content}`)
        .join('\n')

      const nowStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true })
      const todayISO = new Date().toISOString().split('T')[0]

      const bd = briefingData || {}
      const loadsStr = bd.loadsToday?.length
        ? bd.loadsToday.map(l => typeof l === 'object' ? `${l.name} (${l.status})` : l).join(', ')
        : 'None'
      const liveDataLines = [
        `Today: ${bd.todayStr || todayISO} (${new Date((bd.todayStr || todayISO) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}) | Time: ${nowStr} ET`,
        `Loads/deliveries today: ${loadsStr}`,
        `  (status key: active=not yet out, on_delivery=on truck now, delivered=done today)`,
        `Pending reminders: ${bd.remindersToday?.length ? bd.remindersToday.map(r => r.title + ' at ' + r.due_time).join(', ') : 'None'}`,
        `Active orders: ${bd.activeOrders?.length ? bd.activeOrders.join(', ') : 'None'}`,
        `Completed orders (ready to archive): ${bd.completedOrders?.length ? bd.completedOrders.join(', ') : 'None'}`,
      ].join('\n')

      const firstPrompt = [
        SYSTEM_PROMPT,
        `LIVE DATA:\n${liveDataLines}`,
        historyStr ? `CONVERSATION:\n${historyStr}` : '',
        `User: ${currentInput}`
      ].filter(Boolean).join('\n\n')

      const firstResponse = await base44.integrations.Core.InvokeLLM({
        prompt: firstPrompt,
        model: 'claude_sonnet_4_6'
      })

      // Handle REMINDER
      const reminderMatch = firstResponse.match(/ACTION:CREATE_REMINDER:(\{.*?\})/)
      if (reminderMatch) {
        try {
          const { title, due_time } = JSON.parse(reminderMatch[1])
          await base44.entities.Reminder.create({ title, due_time, is_completed: false, is_dismissed: false, telegram_sent: false })
        } catch (e) {
          console.error('Reminder creation failed:', e)
        }
        const displayText = firstResponse.replace(/ACTION:CREATE_REMINDER:\{.*?\}\n?/, '').trim() || '✅ Reminder set!'
        setMessages(prev => [...prev, { role: 'assistant', content: displayText }])
        clearTimeout(loadingTimeout)
        setIsLoading(false)
        return
      }

      // Handle SEARCH — up to 2 sequential searches before final answer
      const SEARCH_RE = /ACTION:(SEARCH_ORDER|SEARCH_LOAD|GET_ORDER_ITEMS|GET_RECEIPT):(\{.*?\})/
      let currentResponse = firstResponse
      let accumulatedResults = []
      const MAX_SEARCHES = 2

      for (let i = 0; i < MAX_SEARCHES; i++) {
        const searchMatch = currentResponse.match(SEARCH_RE)
        if (!searchMatch) break

        const actionType = searchMatch[1]
        let params = {}
        try { params = JSON.parse(searchMatch[2]) } catch {}

        const label = params.customer_name ? `${params.customer_name}` : 'data'
        setMessages(prev => {
          const withoutSpinner = prev.filter(m => !(m.role === 'system' && m.content.startsWith('🔍')))
          return [...withoutSpinner, { role: 'system', content: `🔍 Looking up ${label}${i > 0 ? ' (2/2)' : ''}...` }]
        })

        const searchResult = await runSearchAction(actionType, params)
        accumulatedResults.push(`SEARCH ${i + 1} (${actionType} for ${label}):\n${searchResult}`)

        // If we haven't hit the max yet, ask Claude if it needs another search
        if (i < MAX_SEARCHES - 1) {
          const continuePrompt = [
            SYSTEM_PROMPT,
            `LIVE DATA:\n${liveDataLines}`,
            historyStr ? `CONVERSATION:\n${historyStr}` : '',
            `User: ${currentInput}`,
            accumulatedResults.join('\n\n'),
            `Do you have enough information to answer the user's question, or do you need one more search? If you need another search, output the ACTION line. If you have enough, answer the user directly.`
          ].filter(Boolean).join('\n\n')

          currentResponse = await base44.integrations.Core.InvokeLLM({
            prompt: continuePrompt,
            model: 'claude_sonnet_4_6'
          })

          // If no more search needed, this is the final answer
          if (!SEARCH_RE.test(currentResponse)) break
        }
      }

      // Final answer pass — if we did any searches, do one more call with all results
      if (accumulatedResults.length > 0) {
        let finalAnswer = currentResponse
        if (SEARCH_RE.test(currentResponse) || accumulatedResults.length > 0) {
          const finalPrompt = [
            SYSTEM_PROMPT,
            `LIVE DATA:\n${liveDataLines}`,
            historyStr ? `CONVERSATION:\n${historyStr}` : '',
            `User: ${currentInput}`,
            accumulatedResults.join('\n\n'),
            `Now give your final answer. Be concise and direct.`
          ].filter(Boolean).join('\n\n')

          finalAnswer = await base44.integrations.Core.InvokeLLM({
            prompt: finalPrompt,
            model: 'claude_sonnet_4_6'
          })
        }

        setMessages(prev => {
          const withoutSpinner = prev.filter(m => !(m.role === 'system' && m.content.startsWith('🔍')))
          return [...withoutSpinner, { role: 'assistant', content: finalAnswer }]
        })
      } else {
        // No search needed — direct answer
        setMessages(prev => [...prev, { role: 'assistant', content: currentResponse }])
      }

    } catch (error) {
      console.error('Jarvis error:', error)
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + (error?.message || 'unknown — open browser console for details') }])
    } finally {
      clearTimeout(loadingTimeout)
      setIsLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', ...style }}>
      <div className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between" style={{ flexShrink: 0 }}>
        <span className="font-semibold text-sm">Jarvis</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(prev => !prev)}
            className="p-1 hover:bg-indigo-700 rounded transition-all"
            aria-label="Toggle size"
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-indigo-700 rounded transition-all"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }} className="p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            <p className="font-semibold">Hey, I'm Jarvis.</p>
            <p className="text-xs mt-2">Loading your briefing...</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            if (msg.role === 'system') {
              return (
                <div key={idx} className="flex justify-center">
                  <span className="text-xs text-gray-400 italic">{msg.content}</span>
                </div>
              )
            }
            return (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-900'
                  }`}
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {msg.content}
                </div>
              </div>
            )
          })
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-900 rounded-lg px-3 py-2 text-sm">
              <span className="inline-block animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-200 p-3 flex gap-2" style={{ flexShrink: 0 }}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
          placeholder="Ask me something..."
          className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          disabled={isLoading}
        />
        <Button
          onClick={handleSendMessage}
          disabled={isLoading || !inputValue.trim()}
          size="icon"
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}