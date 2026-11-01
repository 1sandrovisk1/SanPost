import Image from 'next/image';

export const LogoTextComponent = () => {
  return (
    <div
      role="img"
      aria-label="SanPost"
      className="flex items-center gap-[8px] text-current"
    >
      <Image src="/logo.svg" alt="" width={36} height={31} />
      <span
        aria-hidden="true"
        className="text-[26px] font-bold leading-none tracking-[0.04em]"
      >
        <span className="text-[#F82125]">SAN</span>
        <span className="text-current">POST</span>
      </span>
    </div>
  );
};
