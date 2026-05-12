import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';

export default function AutoSaveInput({ value, onSave, ...props }) {
    const [localValue, setLocalValue] = useState(value || '');

    useEffect(() => {
        setLocalValue(value || '');
    }, [value]);

    const handleChange = (e) => {
        setLocalValue(e.target.value);
    };

    const handleBlur = () => {
        if (localValue !== (value || '')) {
            onSave(localValue);
        }
    };

    return (
        <Input
            {...props}
            value={localValue}
            onChange={handleChange}
            onBlur={handleBlur}
        />
    );
}