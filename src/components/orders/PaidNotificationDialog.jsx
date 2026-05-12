import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mail, X } from 'lucide-react';

export default function PaidNotificationDialog({ isOpen, onClose, onSend, receiptNumber, isSending }) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Mail className="w-5 h-5 text-indigo-600" />
            Send Payment Notification?
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-600 mt-1">
            Receipt <span className="font-semibold text-gray-800">#{receiptNumber}</span> has been marked as paid.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 my-2">
          <p className="text-sm text-indigo-800">
            Send an email notification to{' '}
            <span className="font-semibold">pam@mattawanlandscape.com</span>{' '}
            letting them know this receipt has been paid?
          </p>
        </div>

        <div className="flex gap-3 mt-2">
          <Button
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={onSend}
            disabled={isSending}
          >
            {isSending ? 'Sending...' : '✉️ Send Email'}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={isSending}
          >
            Skip
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}