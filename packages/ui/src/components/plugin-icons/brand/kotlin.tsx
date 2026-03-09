import * as React from "react";

const KotlinIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 256 256"
    {...props}
  >
    <defs>
      <linearGradient id="ktG" x1="99.991%" x2=".01%" y1="-.011%" y2="100.01%">
        <stop offset=".344%" stopColor="#E44857" />
        <stop offset="46.89%" stopColor="#C711E1" />
        <stop offset="100%" stopColor="#7F52FF" />
      </linearGradient>
    </defs>
    <path fill="url(#ktG)" d="M256 256H0V0h256L128 127.949z" />
  </svg>
);

export default KotlinIcon;
