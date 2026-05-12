import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from 'lucide-react';

export default function DeleteWithOptionsDialog({
  open,
  onOpenChange,
  onDelete,
  entityType = "Load",
  entityName = "",
  isPending = false,
  deleteProgress = null, // { current, total, stage } — passed in from parent during delete
}) {
  const [isPermanent, setIsPermanent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleDelete = () => {
    onDelete(isPermanent);
    setConfirmed(false);
    setIsPermanent(false);
  };

  const pct = deleteProgress?.total > 0
    ? Math.round((deleteProgress.current / deleteProgress.total) * 100)
    : null;

  // While deleting — show progress overlay instead of the form
  if (isPending && deleteProgress) {
    return (
      <AlertDialog open={open}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              Deleting {entityType}{entityName ? `: ${entityName}` : ''}...
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="mt-4 space-y-3">
                <p className="text-sm text-gray-600">{deleteProgress.stage || 'Working...'}</p>
                {pct !== null && (
                  <>
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 text-right">
                      {deleteProgress.current} / {deleteProgress.total} items · {pct}%
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {entityType}{entityName ? `: ${entityName}` : ''}?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4 mt-4">
            <div>
              <p className="font-semibold text-gray-900 mb-3">Choose how you want to delete this {entityType.toLowerCase()}:</p>
              
              {/* Archive Option (Default) */}
              <div className="space-y-3">
                <div className="p-3 border-2 border-blue-200 bg-blue-50 rounded-lg cursor-pointer" onClick={() => setIsPermanent(false)}>
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="deleteMethod"
                      value="archive"
                      checked={!isPermanent}
                      onChange={() => setIsPermanent(false)}
                      className="mt-1 w-4 h-4 cursor-pointer"
                    />
                    <div className="flex-1">
                      <Label className="font-semibold text-gray-900 cursor-pointer block mb-1">Archive (Recommended)</Label>
                      <p className="text-sm text-gray-600">
                        Move to archive. All data is preserved and can be recovered later. 
                        Archived {entityType.toLowerCase()}s are hidden from active views.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Permanent Delete Option */}
                <div className="p-3 border-2 border-red-200 bg-red-50 rounded-lg cursor-pointer" onClick={() => setIsPermanent(true)}>
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="deleteMethod"
                      value="permanent"
                      checked={isPermanent}
                      onChange={() => setIsPermanent(true)}
                      className="mt-1 w-4 h-4 cursor-pointer"
                    />
                    <div className="flex-1">
                      <Label className="font-semibold text-red-700 cursor-pointer block mb-1">⚠️ Permanent Delete</Label>
                      <p className="text-sm text-gray-600">
                        Permanently delete all data. This action cannot be undone. 
                        Use this only for test data.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Confirmation for permanent delete */}
              {isPermanent && (
                <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox 
                      checked={confirmed}
                      onCheckedChange={setConfirmed}
                    />
                    <span className="text-sm font-semibold text-red-800">
                      I understand this cannot be undone
                    </span>
                  </label>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => {
            setConfirmed(false);
            setIsPermanent(false);
          }}>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleDelete}
            disabled={isPending || (isPermanent && !confirmed)}
            className={isPermanent ? 'bg-red-600 hover:bg-red-700' : ''}
          >
            {isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Deleting...</> : isPermanent ? 'Permanently Delete' : 'Archive'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
