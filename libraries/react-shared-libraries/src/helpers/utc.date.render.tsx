'use client';

import { fromUtc } from '@gitroom/helpers/utils/user.timezone';
import { FC } from 'react';
export const UtcToLocalDateRender: FC<{
  date: string;
  format: string;
}> = (props) => {
  const { date, format } = props;
  return <>{fromUtc(date).format(format)}</>;
};
