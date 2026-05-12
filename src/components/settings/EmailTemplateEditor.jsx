import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from '@/components/ui/badge';

const TEMPLATE_VARIABLES = {
  first_item_delivered: [
    '{{customer_name}}',
    '{{customer_phone}}',
    '{{job_address}}',
    '{{receipt_numbers}}',
    '{{delivery_date}}',
    '{{items_list}}',
    '{{notes}}'
  ],
  order_completed: [
    '{{customer_name}}',
    '{{receipt_numbers}}',
    '{{job_address}}'
  ],
  order_archived: [
    '{{customer_name}}',
    '{{receipt_numbers}}',
    '{{job_address}}'
  ],
  delivery_reminder: [
    '{{customer_name}}',
    '{{customer_phone}}',
    '{{job_address}}',
    '{{delivery_date}}',
    '{{receipt_numbers}}',
    '{{items_list}}'
  ]
};

export default function EmailTemplateEditor({ template, isOpen, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    template_type: 'first_item_delivered',
    recipient_email: '',
    subject: '',
    body: '',
    is_html: false,
    is_active: true
  });

  useEffect(() => {
    if (template) {
      setFormData(template);
    } else {
      setFormData({
        name: '',
        template_type: 'first_item_delivered',
        recipient_email: '',
        subject: '',
        body: '',
        is_html: false,
        is_active: true
      });
    }
  }, [template, isOpen]);

  const handleSave = () => {
    onSave(formData);
  };

  const insertVariable = (variable) => {
    setFormData({
      ...formData,
      body: formData.body + ' ' + variable
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit Email Template' : 'Create Email Template'}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label>Template Name</Label>
            <Input 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="e.g., First Item Delivered Notification"
            />
          </div>

          <div className="grid gap-2">
            <Label>Template Type</Label>
            <Select 
              value={formData.template_type}
              onValueChange={(val) => setFormData({...formData, template_type: val})}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="first_item_delivered">First Item Delivered</SelectItem>
                  <SelectItem value="order_completed">Order Completed</SelectItem>
                  <SelectItem value="order_archived">Order Archived</SelectItem>
                  <SelectItem value="delivery_reminder">Delivery Reminder (Day Before)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Recipient Email</Label>
            <Input 
              type="email"
              value={formData.recipient_email}
              onChange={(e) => setFormData({...formData, recipient_email: e.target.value})}
              placeholder="e.g., notifications@example.com"
            />
          </div>

          <div className="grid gap-2">
            <Label>Email Subject</Label>
            <Input 
              value={formData.subject}
              onChange={(e) => setFormData({...formData, subject: e.target.value})}
              placeholder="e.g., ⚠️ First Item Delivered - {{customer_name}} (UNPAID)"
            />
          </div>

          <div className="grid gap-2">
            <Label>Available Variables</Label>
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_VARIABLES[formData.template_type].map(variable => (
                <Badge 
                  key={variable}
                  variant="outline"
                  className="cursor-pointer hover:bg-indigo-50"
                  onClick={() => insertVariable(variable)}
                >
                  {variable}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-gray-500">Click a variable to insert it into the email body</p>
          </div>

          <div className="grid gap-2">
            <Label>Email Body</Label>
            <Textarea 
              value={formData.body}
              onChange={(e) => setFormData({...formData, body: e.target.value})}
              className="h-64 font-mono text-xs"
              placeholder="Enter your email template here. Use variables like {{customer_name}} for dynamic content."
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox 
              id="is_html"
              checked={formData.is_html}
              onCheckedChange={(checked) => setFormData({...formData, is_html: checked})}
            />
            <label htmlFor="is_html" className="text-sm cursor-pointer">
              Use HTML formatting
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox 
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
            />
            <label htmlFor="is_active" className="text-sm cursor-pointer">
              Active (use this template for notifications)
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Template</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}