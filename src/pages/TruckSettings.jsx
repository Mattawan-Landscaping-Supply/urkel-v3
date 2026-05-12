import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Plus, Edit, Trash2, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { Badge } from '@/components/ui/badge';

export default function TruckSettings() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSetting, setEditingSetting] = useState(null);
  const [deletingSetting, setDeletingSetting] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    max_weight_capacity: '',
    length: '',
    width: '',
    warning_threshold: 90
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['truckSettings'],
    queryFn: () => base44.entities.TruckSettings.list('-created_date')
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TruckSettings.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['truckSettings']);
      setIsCreateOpen(false);
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TruckSettings.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['truckSettings']);
      setEditingSetting(null);
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TruckSettings.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['truckSettings']);
      setDeletingSetting(null);
    }
  });

  const setActiveMutation = useMutation({
    mutationFn: async (id) => {
      // Set all to inactive
      for (const setting of settings || []) {
        if (setting.is_active) {
          await base44.entities.TruckSettings.update(setting.id, { is_active: false });
        }
      }
      // Set selected to active
      await base44.entities.TruckSettings.update(id, { is_active: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['truckSettings']);
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      max_weight_capacity: '',
      length: '',
      width: '',
      warning_threshold: 90
    });
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (setting) => {
    setFormData({
      name: setting.name,
      max_weight_capacity: setting.max_weight_capacity,
      length: setting.length || '',
      width: setting.width || '',
      warning_threshold: setting.warning_threshold || 90
    });
    setEditingSetting(setting);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      name: formData.name,
      max_weight_capacity: parseFloat(formData.max_weight_capacity),
      length: formData.length ? parseFloat(formData.length) : undefined,
      width: formData.width ? parseFloat(formData.width) : undefined,
      warning_threshold: parseInt(formData.warning_threshold) || 90
    };

    if (editingSetting) {
      updateMutation.mutate({ id: editingSetting.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="w-8 h-8" />
            Truck Settings
          </h1>
          <p className="text-gray-500 mt-1">Configure truck capacity and dimensions for load planning.</p>
        </div>
        <Button onClick={handleOpenCreate} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="w-5 h-5 mr-2" />
          Add Truck Setting
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {settings?.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
              <p className="text-gray-500">No truck settings found.</p>
            </div>
          ) : (
            settings?.map(setting => (
              <Card key={setting.id} className="hover:shadow-lg transition-shadow border-gray-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-bold text-gray-900">{setting.name}</h3>
                  </div>

                  <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <p>
                      <span className="font-semibold">Max Weight:</span>{' '}
                      {setting.max_weight_capacity?.toLocaleString()} lbs
                    </p>
                    {setting.length && setting.width && (
                      <p>
                        <span className="font-semibold">Bed Size:</span>{' '}
                        {setting.length}' × {setting.width}' ({(setting.length * setting.width).toFixed(1)} sq ft)
                      </p>
                    )}
                    <p>
                      <span className="font-semibold">Warning at:</span> {setting.warning_threshold}%
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenEdit(setting)}
                      className="flex-1"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeletingSetting(setting)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateOpen || !!editingSetting} onOpenChange={(open) => {
        if (!open) {
          setIsCreateOpen(false);
          setEditingSetting(null);
          resetForm();
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingSetting ? 'Edit Truck Setting' : 'Add Truck Setting'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Setting Name *</Label>
              <Input
                id="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. With Moffett, Standard Load"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="weight">Max Weight Capacity (lbs) *</Label>
              <Input
                id="weight"
                type="number"
                step="1"
                required
                value={formData.max_weight_capacity}
                onChange={(e) => setFormData({ ...formData, max_weight_capacity: e.target.value })}
                placeholder="e.g. 48000"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="length">Truck Bed Length (ft)</Label>
                <Input
                  id="length"
                  type="number"
                  step="0.1"
                  value={formData.length}
                  onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                  placeholder="e.g. 24"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="width">Truck Bed Width (ft)</Label>
                <Input
                  id="width"
                  type="number"
                  step="0.1"
                  value={formData.width}
                  onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                  placeholder="e.g. 8"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="threshold">Warning Threshold (%)</Label>
              <Input
                id="threshold"
                type="number"
                min="1"
                max="100"
                value={formData.warning_threshold}
                onChange={(e) => setFormData({ ...formData, warning_threshold: e.target.value })}
                placeholder="e.g. 90"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : (editingSetting ? 'Update' : 'Create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingSetting} onOpenChange={(open) => !open && setDeletingSetting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Truck Setting?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deletingSetting?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deletingSetting.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}