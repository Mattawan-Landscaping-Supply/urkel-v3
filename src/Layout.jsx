import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import LightspeedStandaloneImportDialog from '@/components/lightspeed/LightspeedStandaloneImportDialog';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { LayoutDashboard, Archive, Package, Plus, Box, Users, Settings as SettingsIcon, ChevronDown, Zap, Calendar as CalendarIcon, Menu, X, AlertCircle, PackageOpen, Map } from 'lucide-react';
import AIAssistant from '@/components/AIAssistant';
import MonitoringAlertsBell from '@/components/MonitoringAlertsBell';
import RemindersBell from '@/components/RemindersBell';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from '@/components/ui/button';

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLightspeedImportOpen, setIsLightspeedImportOpen] = useState(false);
  const [isJarvisOpen, setIsJarvisOpen] = useState(false);
  
  // Fetch briefing data at Layout level so Jarvis always has it regardless of current page
  const todayStr = new Date().toISOString().split('T')[0];
  const { data: jarvisLoadsToday = [] } = useQuery({
    queryKey: ['jarvis-loads-today', todayStr],
    queryFn: () => base44.entities.Load.filter({ delivery_date: todayStr }, '-created_date', 100),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const { data: jarvisReminders = [] } = useQuery({
    queryKey: ['jarvis-reminders-briefing'],
    queryFn: () => base44.entities.Reminder.filter({ is_completed: false, is_dismissed: false }, '-due_time', 100),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  // Also fetch DeliveryReminders for today — these are scheduled deliveries without a Load record yet
  const { data: jarvisDeliveryRemindersToday = [] } = useQuery({
    queryKey: ['jarvis-delivery-reminders-today', todayStr],
    queryFn: () => base44.entities.DeliveryReminder.filter({ scheduled_date: todayStr, is_resolved: false }, '-created_date', 100),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  // Active orders for Jarvis — always available regardless of page
  const { data: jarvisActiveOrders = [] } = useQuery({
    queryKey: ['jarvis-active-orders'],
    queryFn: () => base44.entities.Order.filter({ is_archived: false, is_completed: false }, '-updated_date', 200),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Completed (ready to archive) orders for Jarvis
  const { data: jarvisCompletedOrders = [] } = useQuery({
    queryKey: ['jarvis-completed-orders'],
    queryFn: () => base44.entities.Order.filter({ is_completed: true, is_archived: false }, '-updated_date', 100),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const jarvisBriefingData = useMemo(() => {
    const overdueAndTodayReminders = jarvisReminders.filter(r => r.due_time && r.due_time.slice(0, 10) <= todayStr);
    // Include ALL today's loads with status so Jarvis knows what's delivered vs pending
    const loadsWithStatus = jarvisLoadsToday.filter(l => l.status !== 'archived').map(l => ({
      name: l.customer_name || l.company_name || l.name || 'Unknown',
      status: l.status || 'active'
    }));
    const loadNamesForDedup = loadsWithStatus.map(l => l.name);
    const deliveryReminderNames = jarvisDeliveryRemindersToday.map(r => r.customer_name).filter(n => n && !loadNamesForDedup.includes(n));
    return {
      todayStr,
      loadsToday: loadsWithStatus,
      deliveryRemindersToday: deliveryReminderNames,
      remindersToday: overdueAndTodayReminders.map(r => ({ title: r.title, due_time: r.due_time })),
      notes: (window.__jarvisMemoryNotes || []),
      activeOrders: jarvisActiveOrders.map(o => o.company_name || o.customer_name).filter(Boolean),
      completedOrders: jarvisCompletedOrders.map(o => o.company_name || o.customer_name).filter(Boolean),
    };
  }, [todayStr, jarvisLoadsToday, jarvisReminders, jarvisDeliveryRemindersToday, jarvisActiveOrders, jarvisCompletedOrders]);

  // Check URL to detect print pages
  const isPrintView = location.pathname.includes('PrintView') || 
                      location.pathname.includes('PrintReceipt') ||
                      location.pathname.includes('PrintSchedule');
  
  // Determine active page
  const dashboardPath = createPageUrl('Dashboard');
  const completedPath = createPageUrl('CompletedOrders');
  const archivedPath = createPageUrl('ArchivedOrders');
  const customersPath = createPageUrl('Customers');
  const customerDetailsPath = createPageUrl('CustomerDetails');
  const productCatalogPath = createPageUrl('ProductCatalog');
  const orderDetailsPath = createPageUrl('OrderDetails');
  const settingsPath = createPageUrl('Settings');
  
  const isActiveDashboard = location.pathname === '/' || 
                           location.pathname === dashboardPath || 
                           location.pathname.startsWith(dashboardPath) ||
                           location.pathname === orderDetailsPath ||
                           location.pathname.startsWith(orderDetailsPath);
  const isCompletedOrders = location.pathname === completedPath || location.pathname.startsWith(completedPath);
  const isArchivedOrders = location.pathname === archivedPath || location.pathname.startsWith(archivedPath);
  const isCustomers = location.pathname === customersPath || 
                     location.pathname.startsWith(customersPath) ||
                     location.pathname === customerDetailsPath ||
                     location.pathname.startsWith(customerDetailsPath);
  const isProductCatalog = location.pathname === productCatalogPath || location.pathname.startsWith(productCatalogPath);
  const isTruckSettings = location.pathname === createPageUrl('TruckSettings') || location.pathname.startsWith(createPageUrl('TruckSettings'));
  const isSettings = location.pathname === settingsPath || location.pathname.startsWith(settingsPath);
  const isDeliveryCalendar = location.pathname === createPageUrl('DeliveryCalendar') || location.pathname.startsWith(createPageUrl('DeliveryCalendar'));

  React.useEffect(() => {
    document.title = "Urkel 2.0";
  }, []);

  // Close mobile menu on navigation
  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  if (isPrintView) {
    return <div className="bg-white min-h-screen p-8 print:p-0">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Top Header - Always visible */}
        <header className="bg-white border-b-2 border-gray-300 shrink-0 print:hidden">
          <div className="h-14 flex items-center justify-between px-4 md:px-6">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6962ca7ed1a1badc683a33a7/79a7bb12c_IMG_8505.jpeg" alt="Urkel" className="h-10 w-auto" />
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-1 px-3 py-1.5 h-auto text-sm font-semibold"
                    style={{ backgroundColor: location.pathname === createPageUrl('Deliver') || location.pathname.startsWith(createPageUrl('Deliver')) || location.pathname.startsWith(createPageUrl('LoadDetails')) || isDeliveryCalendar ? '#4f46e5' : 'transparent', color: location.pathname === createPageUrl('Deliver') || location.pathname.startsWith(createPageUrl('Deliver')) || location.pathname.startsWith(createPageUrl('LoadDetails')) || isDeliveryCalendar ? '#ffffff' : '#374151' }}>
                    <Package className="w-4 h-4" />LoadMaster<ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => navigate(createPageUrl('DeliveryCalendar'))}><CalendarIcon className="w-4 h-4 mr-2" />Delivery Calendar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl('OptimizeDelivery'))}><Zap className="w-4 h-4 mr-2" />New Optimized Delivery</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl('Deliver') + '?manual=true')}><Package className="w-4 h-4 mr-2" />Build Load Manually</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl('Deliver'))}><Package className="w-4 h-4 mr-2" />View All Deliveries</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-1 px-3 py-1.5 h-auto text-sm font-semibold"
                    style={{ backgroundColor: (isActiveDashboard || isCompletedOrders || isArchivedOrders) ? '#4f46e5' : 'transparent', color: (isActiveDashboard || isCompletedOrders || isArchivedOrders) ? '#ffffff' : '#374151' }}>
                    <LayoutDashboard className="w-4 h-4" />Orders<ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => { if (location.pathname === '/' || location.pathname === createPageUrl('Dashboard')) { window.dispatchEvent(new CustomEvent('openCreateDialog')); } else { navigate(createPageUrl('Dashboard') + '?new=true'); } }}><Plus className="w-4 h-4 mr-2" />New Order</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl('Dashboard'))}><LayoutDashboard className="w-4 h-4 mr-2" />Active Orders</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl('CompletedOrders'))}><Package className="w-4 h-4 mr-2" />Completed Orders</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl('ArchivedOrders'))}><Archive className="w-4 h-4 mr-2" />Archived Orders</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl('Receiving'))}><PackageOpen className="w-4 h-4 mr-2" />Receiving</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsLightspeedImportOpen(true)}><Zap className="w-4 h-4 mr-2" />Import from Lightspeed</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
            </div>

            {/* Desktop Right Side */}
            <div className="hidden md:flex items-center gap-1">
              <MonitoringAlertsBell />
              <RemindersBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-1 px-3 py-1.5 h-auto text-sm font-semibold"
                    style={{ backgroundColor: (isCustomers || isProductCatalog || isTruckSettings || isSettings || location.pathname.includes('Import') || location.pathname.includes('Monitoring')) ? '#4f46e5' : 'transparent', color: (isCustomers || isProductCatalog || isTruckSettings || isSettings || location.pathname.includes('Import') || location.pathname.includes('Monitoring')) ? '#ffffff' : '#374151' }}>
                    <SettingsIcon className="w-4 h-4" />Manage<ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(createPageUrl('MonitoringAlerts'))}><AlertCircle className="w-4 h-4 mr-2" />Monitoring Alerts</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl('Customers'))}><Users className="w-4 h-4 mr-2" />Customers</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl('ProductCatalog'))}><Box className="w-4 h-4 mr-2" />Product Catalog</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl('TruckSettings'))}><Package className="w-4 h-4 mr-2" />Truck Settings</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl('LightspeedMapping'))}><Map className="w-4 h-4 mr-2" />LS Product Mapping</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(createPageUrl('Settings'))}><SettingsIcon className="w-4 h-4 mr-2" />Email Notifications</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Mobile Right Side */}
            <div className="flex md:hidden items-center gap-2">
              <MonitoringAlertsBell />
              <RemindersBell />
              <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile Menu Dropdown */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-gray-200 bg-white py-2 px-4 space-y-1">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 pt-2 pb-1">LoadMaster</p>
              <button onClick={() => navigate(createPageUrl('DeliveryCalendar'))} className="flex items-center gap-2 w-full text-left px-2 py-2.5 rounded-lg hover:bg-gray-100 text-sm font-medium"><CalendarIcon className="w-4 h-4 text-indigo-600" />Delivery Calendar</button>
              <button onClick={() => navigate(createPageUrl('OptimizeDelivery'))} className="flex items-center gap-2 w-full text-left px-2 py-2.5 rounded-lg hover:bg-gray-100 text-sm font-medium"><Zap className="w-4 h-4 text-indigo-600" />New Optimized Delivery</button>
              <button onClick={() => navigate(createPageUrl('Deliver'))} className="flex items-center gap-2 w-full text-left px-2 py-2.5 rounded-lg hover:bg-gray-100 text-sm font-medium"><Package className="w-4 h-4 text-indigo-600" />View All Deliveries</button>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 pt-3 pb-1">Orders</p>
              <button onClick={() => { navigate(createPageUrl('Dashboard') + '?new=true'); }} className="flex items-center gap-2 w-full text-left px-2 py-2.5 rounded-lg hover:bg-gray-100 text-sm font-medium"><Plus className="w-4 h-4 text-indigo-600" />New Order</button>
              <button onClick={() => navigate(createPageUrl('Dashboard'))} className="flex items-center gap-2 w-full text-left px-2 py-2.5 rounded-lg hover:bg-gray-100 text-sm font-medium"><LayoutDashboard className="w-4 h-4 text-indigo-600" />Active Orders</button>
              <button onClick={() => navigate(createPageUrl('CompletedOrders'))} className="flex items-center gap-2 w-full text-left px-2 py-2.5 rounded-lg hover:bg-gray-100 text-sm font-medium"><Package className="w-4 h-4 text-indigo-600" />Completed Orders</button>
              <button onClick={() => navigate(createPageUrl('ArchivedOrders'))} className="flex items-center gap-2 w-full text-left px-2 py-2.5 rounded-lg hover:bg-gray-100 text-sm font-medium"><Archive className="w-4 h-4 text-indigo-600" />Archived Orders</button>
              <button onClick={() => navigate(createPageUrl('Receiving'))} className="flex items-center gap-2 w-full text-left px-2 py-2.5 rounded-lg hover:bg-gray-100 text-sm font-medium"><PackageOpen className="w-4 h-4 text-indigo-600" />Receiving</button>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 pt-3 pb-1">Manage</p>
              <button onClick={() => navigate(createPageUrl('Customers'))} className="flex items-center gap-2 w-full text-left px-2 py-2.5 rounded-lg hover:bg-gray-100 text-sm font-medium"><Users className="w-4 h-4 text-indigo-600" />Customers</button>
              <button onClick={() => navigate(createPageUrl('ProductCatalog'))} className="flex items-center gap-2 w-full text-left px-2 py-2.5 rounded-lg hover:bg-gray-100 text-sm font-medium"><Box className="w-4 h-4 text-indigo-600" />Product Catalog</button>
              <button onClick={() => navigate(createPageUrl('TruckSettings'))} className="flex items-center gap-2 w-full text-left px-2 py-2.5 rounded-lg hover:bg-gray-100 text-sm font-medium"><Package className="w-4 h-4 text-indigo-600" />Truck Settings</button>
              <button onClick={() => navigate(createPageUrl('LightspeedMapping'))} className="flex items-center gap-2 w-full text-left px-2 py-2.5 rounded-lg hover:bg-gray-100 text-sm font-medium"><Map className="w-4 h-4 text-indigo-600" />LS Product Mapping</button>
              <button onClick={() => navigate(createPageUrl('Settings'))} className="flex items-center gap-2 w-full text-left px-2 py-2.5 rounded-lg hover:bg-gray-100 text-sm font-medium pb-3"><SettingsIcon className="w-4 h-4 text-indigo-600" />Email Notifications</button>
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-3 md:p-6">
          {children}
        </main>

        {/* AI Assistant */}
        {isJarvisOpen && (
          <div className="no-print jarvis-container" style={{ display: 'flex', flexDirection: 'column', width: '420px', maxHeight: 'calc(100vh - 40px)', position: 'fixed', bottom: '20px', top: 'auto', right: '20px', zIndex: 1000, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.2)', backgroundColor: 'white', transition: 'all 0.3s ease' }}>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <AIAssistant
                systemPrompt={window.__jarvisSystemPrompt || ''}
                briefingData={jarvisBriefingData}
                style={{ flex: 1, minHeight: 0 }}
                onClose={() => setIsJarvisOpen(false)}
                onExpandChange={(expanded) => {
                  const el = document.querySelector('.jarvis-container');
                  if (!el) return;
                  if (expanded) {
                    el.style.width = '85vw';
                    el.style.maxHeight = '85vh';
                    el.style.height = '85vh';
                    el.style.top = '7vh';
                    el.style.right = '7.5vw';
                    el.style.bottom = 'auto';
                  } else {
                    el.style.width = '420px';
                    el.style.maxHeight = 'calc(100vh - 40px)';
                    el.style.height = '';
                    el.style.top = 'auto';
                    el.style.right = '20px';
                    el.style.bottom = '20px';
                  }
                }}
              />
            </div>
          </div>
        )}
        
        {!isJarvisOpen && (
          <button
            onClick={() => setIsJarvisOpen(true)}
            className="fixed bottom-6 right-6 bg-indigo-600 text-white rounded-full p-4 shadow-lg hover:bg-indigo-700 transition-all no-print"
            aria-label="Open AI Assistant"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
        )}
      </div>

      <LightspeedStandaloneImportDialog
        isOpen={isLightspeedImportOpen}
        onClose={() => setIsLightspeedImportOpen(false)}
      />
    </div>
  );
}