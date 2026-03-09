import * as React from "react";

const SupabaseIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 256 263"
    {...props}
  >
    <defs>
      <linearGradient
        id="SVGvhlZesRv"
        x1="20.862%"
        x2="63.426%"
        y1="20.687%"
        y2="44.071%"
      >
        <stop offset="0%" stopColor="#249361"></stop>
        <stop offset="100%" stopColor="#3ECF8E"></stop>
      </linearGradient>
      <linearGradient
        id="SVGDD1qBdAT"
        x1="1.991%"
        x2="21.403%"
        y1="-13.158%"
        y2="34.708%"
      >
        <stop offset="0%"></stop>
        <stop offset="100%" stopOpacity="0"></stop>
      </linearGradient>
    </defs>
    <path
      fill="url(#SVGvhlZesRv)"
      d="M149.602 258.579c-6.718 8.46-20.338 3.824-20.5-6.977l-2.367-157.984h106.229c19.24 0 29.971 22.223 18.007 37.292z"
    ></path>
    <path
      fill="url(#SVGDD1qBdAT)"
      fillOpacity="0.2"
      d="M149.602 258.579c-6.718 8.46-20.338 3.824-20.5-6.977l-2.367-157.984h106.229c19.24 0 29.971 22.223 18.007 37.292z"
    ></path>
    <path
      fill="#3ECF8E"
      d="M106.399 4.37c6.717-8.461 20.338-3.826 20.5 6.976l1.037 157.984H23.037c-19.241 0-29.973-22.223-18.008-37.292z"
    ></path>
  </svg>
);

export default SupabaseIcon;
