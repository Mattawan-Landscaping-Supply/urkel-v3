import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Bell, Truck, Package, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';

// Global event bus for triggering notification refresh from anywhere in the app
export const notificationEvents = {
  listeners: new Set(),
  emit() {
    this.listeners.forEach(fn => fn());
  },
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
};

export default function NotificationCenter() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await base44.functions.invoke('getPendingTasks', {});
      setTasks(response?.data?.tasks || []);
    } catch (e) {
      console.error('Failed to fetch pending tasks:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    // Subscribe to global notification refresh events (module-level event bus)
    const unsub = notificationEvents.subscribe(fetchTasks);
    // Also listen for window-level events from pages that can't import this module
    const handleWindowEvent = () => fetchTasks();
    window.addEventListener('urkel:notificationsRefresh', handleWindowEvent);
    // Subscribe to real-time entity changes that affect tasks
    const unsubLoad = base44.entities.Load.subscribe(() => fetchTasks());
    const unsubOrderItem = base44.entities.OrderItem.subscribe(() => fetchTasks());
    return () => {
      unsub();
      window.removeEventListener('urkel:notificationsRefresh', handleWindowEvent);
      unsubLoad();
      unsubOrderItem();
    };
  }, [fetchTasks]);

  const handleTaskClick = (task) => {
    setOpen(false);
    navigate(createPageUrl(task.navigateTo));
  };

  const taskCount = tasks.length;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          title="Pending Tasks"
        >
          <Bell className={`w-5 h-5 ${taskCount > 0 ? 'text-orange-500' : 'text-gray-500'}`} />
          {taskCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {taskCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0 text-sm font-semibold text-gray-900">
            Pending Tasks
          </DropdownMenuLabel>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => { e.preventDefault(); fetchTasks(); }}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <DropdownMenuSeparator />
        {isLoading && tasks.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-gray-400">Loading...</div>
        ) : tasks.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-gray-400">
            ✓ No pending tasks
          </div>
        ) : (
          tasks.map((task) => (
            <DropdownMenuItem
              key={`${task.type}-${task.id}`}
              className="flex items-start gap-2.5 px-3 py-3 cursor-pointer hover:bg-orange-50 focus:bg-orange-50"
              onClick={() => handleTaskClick(task)}
            >
              <div className="shrink-0 mt-0.5">
                {task.type === 'delivery_notification' ? (
                  <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
                    <Truck className="w-3.5 h-3.5 text-orange-600" />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                    <Package className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 leading-snug">{task.message}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {task.type === 'delivery_notification' ? 'Click to go to Load' : 'Click to go to Order'}
                </p>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}