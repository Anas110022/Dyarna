import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/src/theme';

// Path data copied 1:1 from docs/dyarna-design-v21.html (#00-INTRO slides).
export function HouseSearchIcon({ size = 72 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 11.5L12 4l8 7.5V20a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1v-8.5z"
        stroke={colors.pine}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Circle cx={17} cy={7} r={5} fill={colors.ivory} stroke={colors.gold} strokeWidth={1.6} />
      <Path d="M15 7l1.3 1.3L19.5 5.5" stroke={colors.gold} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ShieldCheckIcon({ size = 72 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l7 3v6c0 5-3.2 8.2-7 9-3.8-.8-7-4-7-9V6l7-3z"
        stroke={colors.pine}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Path d="M9 12l2 2 4-4" stroke={colors.gold} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function AddCircleIcon({ size = 72 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={colors.goldSoft} strokeWidth={1.6} />
      <Path d="M12 8v8M8 12h8" stroke={colors.gold} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
