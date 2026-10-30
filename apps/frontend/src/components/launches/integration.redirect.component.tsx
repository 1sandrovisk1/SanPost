import { newDayjs } from '@gitroom/helpers/utils/user.timezone';
('use client');

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FC, useEffect } from 'react';
dayjs.extend(utc);
dayjs.extend(timezone);
export const IntegrationRedirectComponent: FC = () => {
  const offset = newDayjs().utcOffset();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const newUrl = `${pathname}/continue?${searchParams.toString()}&timezone=${offset}`;
  useEffect(() => {
    router.push(newUrl);
  }, [newUrl]);
  return null;
};
