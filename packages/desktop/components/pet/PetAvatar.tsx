import { useState } from 'react'
import type { PetConfig, PetMood } from '@/lib/pet/model'

function Eyes({ mood, robot = false }: { mood: PetMood; robot?: boolean }) {
  const ink = robot ? '#94f5db' : '#303047'
  if (mood === 'sleeping' || mood === 'happy')
    return (
      <path
        d={mood === 'happy' ? 'M-20 0q5-8 10 0m20 0q5-8 10 0' : 'M-20 0q5 5 10 0m20 0q5 5 10 0'}
        fill="none"
        stroke={ink}
        strokeWidth="3"
        strokeLinecap="round"
      />
    )
  return (
    <>
      <rect
        x="-18"
        y="-5"
        width={robot ? 7 : 5}
        height={mood === 'waiting' ? 12 : 9}
        rx={robot ? 2 : 3}
        fill={ink}
      />
      <rect
        x="12"
        y="-5"
        width={robot ? 7 : 5}
        height={mood === 'waiting' ? 12 : 9}
        rx={robot ? 2 : 3}
        fill={ink}
      />
      {!robot && (
        <>
          <circle cx="-16" cy="-3" r="1" fill="white" />
          <circle cx="14" cy="-3" r="1" fill="white" />
        </>
      )}
    </>
  )
}

export function PetAvatar({ config, mood }: { config: PetConfig; mood: PetMood }) {
  const [failedImage, setFailedImage] = useState('')
  const image = config.images[mood] ?? config.images.idle
  if (image && failedImage !== image)
    return (
      <img
        src={image}
        onError={() => setFailedImage(image)}
        alt=""
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    )
  const color = config.color
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <ellipse cx="60" cy="112" rx="35" ry="4" fill="#273449" opacity=".16" />
      {config.species === 'cat' ? (
        <g stroke="#48415e" strokeWidth="2.5" strokeLinejoin="round">
          <path d="M83 102c29 1 30-35 18-32-10 2 4 18-17 18" fill={color} />
          <path d="M39 70q-13 20-8 34 28 12 53 0 3-18-10-34" fill={color} />
          <ellipse cx="57" cy="92" rx="16" ry="16" fill="#f5efff" stroke="none" />
          <path d="M23 47 26 17 46 30q13-5 25 0l21-13 2 32q5 29-35 32-40-1-36-34Z" fill={color} />
          <path
            d="m29 34 1-10 10 9m39 0 9-9 1 11"
            stroke="#f6c2d4"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path d="m52 30 2 8m8-9-1 8" stroke="#48415e" opacity=".3" strokeLinecap="round" />
          <g transform="translate(58 51)" stroke="none">
            <Eyes mood={mood} />
          </g>
          <path
            d="m54 60 4 3 4-3m-4 3q-5 9-10 3m10-3q5 9 10 3"
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path d="m25 59-10-2m11 8-10 2m74-8 12-2m-12 10 11 2" strokeWidth="1.7" opacity=".65" />
          <ellipse cx="36" cy="61" rx="6" ry="3" fill="#ed9ebc" stroke="none" opacity=".65" />
          <ellipse cx="81" cy="61" rx="6" ry="3" fill="#ed9ebc" stroke="none" opacity=".65" />
          <path d="M37 77q21 8 41-1l-1 7q-22 9-39 0Z" fill="#6977c9" stroke="none" />
          <circle cx="59" cy="83" r="4" fill="#f9da8f" strokeWidth="1.4" />
          <ellipse cx="42" cy="106" rx="11" ry="5" fill={color} />
          <ellipse cx="73" cy="106" rx="11" ry="5" fill={color} />
        </g>
      ) : config.species === 'fox' ? (
        <g stroke="#713e31" strokeWidth="2.5" strokeLinejoin="round">
          <path d="M65 100C104 119 121 72 103 49c-3 22-24 18-32 32Z" fill={color} />
          <path
            d="M103 49c-2 12-11 17-17 20l14 3 3 12c8-9 9-23 0-35Z"
            fill="#fff3dc"
            stroke="none"
          />
          <path d="M38 71q-8 18-5 35h41q4-20-8-35" fill={color} />
          <path d="m42 77 12 6 12-6-5 23H47Z" fill="#fff3dc" stroke="none" />
          <path d="m24 43-2-32 25 20q8-2 17 0L90 9l-3 35 8 10-38 29-39-29Z" fill={color} />
          <path d="m28 32-1-14 13 17m34-1 11-15-1 14" stroke="#713e31" strokeWidth="4" />
          <path d="M20 54q19-1 37 14 17-16 37-14L57 81Z" fill="#fff3dc" stroke="none" />
          <g transform="translate(56 50)" stroke="none">
            <Eyes mood={mood} />
          </g>
          <path d="m52 67 5 5 5-5Z" fill="#382f36" stroke="none" />
          <path d="m57 72v4" strokeWidth="1.5" />
          <path d="M34 102h14v8H33Zm28 0h12l2 8H62Z" fill="#633e37" stroke="none" />
        </g>
      ) : (
        <g stroke="#254b50" strokeWidth="2.5" strokeLinejoin="round">
          <path d="M60 25V15h12" fill="none" strokeLinecap="round" />
          <circle cx="76" cy="15" r="5" fill="#ffca73" />
          <rect x="34" y="76" width="52" height="29" rx="9" fill={color} />
          <path d="M32 83H23v13m64-13h10v13" fill="none" strokeWidth="7" strokeLinecap="round" />
          <rect x="19" y="95" width="10" height="7" rx="3" fill="#e5f5ee" />
          <rect x="92" y="95" width="10" height="7" rx="3" fill="#e5f5ee" />
          <rect x="13" y="43" width="10" height="21" rx="4" fill="#ffca73" />
          <rect x="97" y="43" width="10" height="21" rx="4" fill="#ffca73" />
          <rect x="21" y="27" width="78" height="52" rx="13" fill={color} />
          <rect x="29" y="35" width="62" height="34" rx="8" fill="#18383f" stroke="none" />
          <path d="M35 43v-3h12" stroke="#f1fff9" opacity=".25" fill="none" strokeWidth="2" />
          <g transform="translate(60 49)" stroke="none">
            <Eyes mood={mood} robot />
          </g>
          <path d="M54 60h12" stroke="#94f5db" strokeWidth="2" strokeLinecap="round" />
          <rect x="43" y="86" width="23" height="9" rx="3" fill="#18383f" stroke="none" />
          <path d="M47 89v3m5-3v3m5-3v3" stroke="#94f5db" strokeWidth="2" />
          <circle
            cx="76"
            cy="90"
            r="3"
            fill={mood === 'working' ? '#ffca73' : '#f1fff9'}
            stroke="none"
          />
          <rect x="34" y="104" width="21" height="7" rx="3" fill="#35545d" />
          <rect x="65" y="104" width="21" height="7" rx="3" fill="#35545d" />
        </g>
      )}
      {mood === 'sleeping' && (
        <text x="98" y="25" fill="#77849d" fontSize="15" fontWeight="bold">
          z
        </text>
      )}
      {mood === 'waiting' && (
        <text x="103" y="31" fill="#d89a38" fontSize="20" fontWeight="bold">
          !
        </text>
      )}
    </svg>
  )
}
