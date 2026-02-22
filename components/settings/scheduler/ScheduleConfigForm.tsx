'use client';

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { ScheduleConfig, SchedulePreset } from '@/types/scheduler';
import { useTranslation } from 'react-i18next';
import { Info, CheckCircle2, XCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CronExpressionParser } from 'cron-parser';
import { format } from 'date-fns';
import { ko, enUS, zhCN } from 'date-fns/locale';

interface ScheduleConfigFormProps {
  schedule: ScheduleConfig;
  onChange: (schedule: ScheduleConfig) => void;
  onValidationChange?: (isValid: boolean) => void;
}

export function ScheduleConfigForm({
  schedule,
  onChange,
  onValidationChange,
}: ScheduleConfigFormProps) {
  const { t, i18n } = useTranslation();
  const [cronError, setCronError] = useState<string | null>(null);
  const [nextRuns, setNextRuns] = useState<Date[]>([]);

  const presets: SchedulePreset[] = ['every-minute', 'hourly', 'daily', 'weekly', 'monthly'];

  const getLocale = () => {
    switch (i18n.language) {
      case 'ko':
        return ko;
      case 'zh':
        return zhCN;
      default:
        return enUS;
    }
  };

  useEffect(() => {
    if (schedule.type === 'cron' && schedule.expression) {
      try {
        const interval = CronExpressionParser.parse(schedule.expression);
        const runs: Date[] = [];
        for (let i = 0; i < 3; i++) {
          runs.push(interval.next().toDate());
        }
        setNextRuns(runs);
        setCronError(null);
        onValidationChange?.(true);
      } catch (error: any) {
        setCronError(error.message || 'Invalid cron expression');
        setNextRuns([]);
        onValidationChange?.(false);
      }
    } else {
      setCronError(null);
      setNextRuns([]);
      // Preset은 항상 유효
      onValidationChange?.(true);
    }
  }, [schedule, onValidationChange]);

  const handleTypeChange = (type: 'preset' | 'cron') => {
    if (type === 'preset') {
      onChange({
        type: 'preset',
        preset: 'daily',
        time: '09:00',
      });
    } else {
      onChange({
        type: 'cron',
        expression: '0 9 * * *',
      });
    }
  };

  const handlePresetChange = (preset: SchedulePreset) => {
    if (schedule.type !== 'preset') {
      return;
    }

    const newSchedule: ScheduleConfig = {
      type: 'preset',
      preset,
    };

    // Set default values based on preset
    if (preset === 'daily' || preset === 'hourly') {
      newSchedule.time = '09:00';
    }
    if (preset === 'weekly') {
      newSchedule.time = '09:00';
      newSchedule.dayOfWeek = 1; // Monday
    }
    if (preset === 'monthly') {
      newSchedule.time = '09:00';
      newSchedule.dayOfMonth = 1;
    }

    onChange(newSchedule);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t('scheduler.scheduleType')}</Label>
        <RadioGroup
          value={schedule.type}
          onValueChange={(value) => handleTypeChange(value as 'preset' | 'cron')}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="preset" id="type-preset" />
            <Label htmlFor="type-preset" className="font-normal cursor-pointer">
              {t('scheduler.preset')}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="cron" id="type-cron" />
            <Label htmlFor="type-cron" className="font-normal cursor-pointer">
              {t('scheduler.cron')}
            </Label>
          </div>
        </RadioGroup>
      </div>

      {schedule.type === 'preset' ? (
        <>
          <div className="space-y-2">
            <Label>{t('scheduler.preset')}</Label>
            <Select value={schedule.preset} onValueChange={handlePresetChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presets.map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {t(
                      `scheduler.preset${preset
                        .split('-')
                        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
                        .join('')}` as any
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(schedule.preset === 'daily' ||
            schedule.preset === 'weekly' ||
            schedule.preset === 'monthly' ||
            schedule.preset === 'hourly') && (
            <div className="space-y-2">
              <Label>{t('scheduler.time')}</Label>
              <Input
                type="time"
                value={schedule.time || '09:00'}
                onChange={(e) =>
                  onChange({
                    ...schedule,
                    time: e.target.value,
                  })
                }
              />
            </div>
          )}

          {schedule.preset === 'weekly' && (
            <div className="space-y-2">
              <Label>{t('scheduler.dayOfWeek')}</Label>
              <Select
                value={String(schedule.dayOfWeek ?? 1)}
                onValueChange={(value) =>
                  onChange({
                    ...schedule,
                    dayOfWeek: parseInt(value),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{t('scheduler.daySunday')}</SelectItem>
                  <SelectItem value="1">{t('scheduler.dayMonday')}</SelectItem>
                  <SelectItem value="2">{t('scheduler.dayTuesday')}</SelectItem>
                  <SelectItem value="3">{t('scheduler.dayWednesday')}</SelectItem>
                  <SelectItem value="4">{t('scheduler.dayThursday')}</SelectItem>
                  <SelectItem value="5">{t('scheduler.dayFriday')}</SelectItem>
                  <SelectItem value="6">{t('scheduler.daySaturday')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {schedule.preset === 'monthly' && (
            <div className="space-y-2">
              <Label>{t('scheduler.dayOfMonth')}</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={schedule.dayOfMonth ?? 1}
                onChange={(e) =>
                  onChange({
                    ...schedule,
                    dayOfMonth: parseInt(e.target.value),
                  })
                }
              />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label>{t('scheduler.cronExpression')}</Label>
            <div className="relative">
              <Input
                placeholder="0 9 * * *"
                value={schedule.expression}
                onChange={(e) =>
                  onChange({
                    ...schedule,
                    expression: e.target.value,
                  })
                }
                className={
                  cronError
                    ? 'border-destructive pr-10'
                    : nextRuns.length > 0
                      ? 'border-green-500 pr-10'
                      : ''
                }
              />
              {cronError && (
                <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-destructive" />
              )}
              {!cronError && nextRuns.length > 0 && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
              )}
            </div>
            {cronError && <p className="text-xs text-destructive mt-1">{cronError}</p>}
          </div>

          {!cronError && nextRuns.length > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-xs space-y-1">
                <div className="font-semibold">다음 3회 실행 시각:</div>
                {nextRuns.map((date, idx) => (
                  <div key={idx}>
                    {idx + 1}. {format(date, 'yyyy-MM-dd HH:mm:ss', { locale: getLocale() })}
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {!nextRuns.length && !cronError && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">{t('scheduler.cronHelp')}</AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
