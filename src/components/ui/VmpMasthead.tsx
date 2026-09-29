export default function VmpMasthead() {
  return <div className="vmp-masthead" role="img" aria-label="VMP Monitor · Hệ giám sát thẩm định">
    <span className="vmp-masthead__ten" aria-hidden="true">
      <span className="vmp-masthead__v">V</span>
      <span className="vmp-masthead__mp">MP</span>
      <i className="vmp-masthead__monitor">Monitor</i>
    </span>
    <svg className="vmp-masthead__net" width="214" height="20" viewBox="0 0 260 20" aria-hidden="true">
      <path d="M2 12C34 4 61 16 98 10" fill="none" strokeWidth="1.15" strokeLinecap="round" />
      <path d="M162 10C197 4 224 15 258 9" fill="none" strokeWidth="1.15" strokeLinecap="round" />
      <g className="vmp-masthead__lotus">
        <path d="M130 12C123 7 124 2 130 0C136 2 137 7 130 12Z" />
        <path d="M129 13C120 12 116 8 118 4C124 5 128 8 129 13Z" />
        <path d="M131 13C140 12 144 8 142 4C136 5 132 8 131 13Z" />
        <path d="M130 12V18" fill="none" strokeWidth="1" strokeLinecap="round" />
        <circle cx="130" cy="18" r="1.3" />
      </g>
    </svg>
    <span className="vmp-masthead__phu">Hệ giám sát thẩm định</span>
  </div>;
}
