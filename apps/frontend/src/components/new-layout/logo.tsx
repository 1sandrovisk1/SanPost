'use client';

import Image from 'next/image';

export const Logo = () => {
  return (
    <div className="mt-[8px] w-[86px] h-[60px] flex items-center justify-center">
      <Image src="/logo.svg" alt="SanPost" width={48} height={48} />
    </div>
  );
};
