import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from 'sonner';
import EmailTemplateEditor from '@/components/settings/EmailTemplateEditor';

export default function Settings() {
  const queryClient = useQueryClient();
  
  const { data: templates, isLoading } = useQuery({
    queryKey: ['emailTemplates'],
    queryFn: () => base44.entities.EmailTemplate.list('-created_date', 100)
  });

  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  const saveTemplateMutation = useMutation({
    mutationFn: (data) => {
      if (editingTemplate) {
        return base44.entities.EmailTemplate.update(editingTemplate.id, data);
      }
      return base44.entities.EmailTemplate.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['emailTemplates']);
      setTemplateEditorOpen(false);
      setEditingTemplate(null);
      toast.success('Template saved successfully');
    }
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id) => base44.entities.EmailTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['emailTemplates']);
      toast.success('Template deleted');
    }
  });



  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your app preferences</p>
      </div>

      {/* Lightspeed Mapping Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Lightspeed Product Mapping</CardTitle>
              <CardDescription>Map Lightspeed catalog items to Urkel products for automatic import matching</CardDescription>
            </div>
            <Link to={createPageUrl('LightspeedMapping')}>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Mapping Table
              </Button>
            </Link>
          </div>
        </CardHeader>
      </Card>

      {/* Email Templates Card */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Email Templates</CardTitle>
              <CardDescription>Customize notification email templates with dynamic variables</CardDescription>
            </div>
            <Button 
              size="sm"
              onClick={() => {
                setEditingTemplate(null);
                setTemplateEditorOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {templates?.map(template => (
              <div 
                key={template.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{template.name}</h4>
                    {template.is_active && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Active</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{template.subject}</p>
                  {template.recipient_email && (
                    <p className="text-xs text-gray-600 mt-1 font-medium">→ {template.recipient_email}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditingTemplate(template);
                      setTemplateEditorOpen(true);
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button 
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm('Delete this template?')) {
                        deleteTemplateMutation.mutate(template.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              </div>
            ))}
            
            {!templates || templates.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No templates created yet. Create your first template to customize email notifications.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <EmailTemplateEditor 
        template={editingTemplate}
        isOpen={templateEditorOpen}
        onClose={() => {
          setTemplateEditorOpen(false);
          setEditingTemplate(null);
        }}
        onSave={(data) => saveTemplateMutation.mutate(data)}
      />

      <Toaster />
    </div>
  );
}