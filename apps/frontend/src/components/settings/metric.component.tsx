'use client';

import { Select } from '@gitroom/react/form/select';
import React, { useState } from 'react';
import { isUSCitizen } from '@gitroom/frontend/components/launches/helpers/isuscitizen.utils';
import timezones from 'timezones-list';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import {
  browserTimezone,
  isTimezone,
  setUserTimezone,
} from '@gitroom/helpers/utils/user.timezone';
const timezoneOptions = timezones.filter((zone) => isTimezone(zone.tzCode));

const MetricComponent = () => {
  const t = useT();
  const [currentMetric, setCurrentMetric] = useState(isUSCitizen());
  const user = useUser();
  const fetchApi = useFetch();
  const toaster = useToaster();
  const [timezone, setTimezone] = useState(user?.timezoneName || '');
  const [saving, setSaving] = useState(false);
  const changeMetric = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setCurrentMetric(value === 'US');
    localStorage.setItem('isUS', value);
  };

  const changeTimezone = async (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = event.target.value;
    setSaving(true);
    try {
      const response = await fetchApi('/user/timezone', {
        method: 'POST',
        body: JSON.stringify({ timezoneName: value || null }),
      });
      if (!response.ok) throw new Error('timezone-save');
      setTimezone(value);
      setUserTimezone(value || null);
      window.location.reload();
    } catch {
      toaster.show(
        t('could_not_save_timezone', 'Could not save the timezone'),
        'warning'
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
      <div className="mt-[4px]">{t('date_metrics', 'Date Metrics')}</div>
      <Select
        name="metric"
        disableForm={true}
        label=""
        onChange={changeMetric}
        value={currentMetric ? 'US' : 'GLOBAL'}
      >
        <option key="US" value="US">
          {t('time_format_ampm', 'AM:PM')}
        </option>
        <option key="GLOBAL" value="GLOBAL">
          {t('time_format_24h', '24 hours')}
        </option>
      </Select>

      <Select
        name="timezone"
        disableForm={true}
        label={t('timezone', 'Timezone')}
        onChange={changeTimezone}
        value={timezone}
        disabled={saving}
      >
        <option value="">
          {t('automatic_timezone', 'Automatic ({{timezone}})', {
            timezone: browserTimezone(),
            interpolation: { escapeValue: false },
          })}
        </option>
        {timezoneOptions.map((zone) => (
          <option key={zone.tzCode} value={zone.tzCode}>
            {zone.label}
          </option>
        ))}
      </Select>
    </div>
  );
};

export default MetricComponent;
