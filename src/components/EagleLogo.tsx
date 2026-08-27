import Svg, { G, Path, Polygon } from 'react-native-svg';

import { colors } from '@/src/theme';

// Exact path data from docs/dyarna-design-v21.html — gold eagle + 3 stars mark.
export function EagleLogo({ size = 42, color = colors.gold }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <G fill={color}>
        <Polygon points="100,22 106,40 90,29" />
        <Polygon points="100,15 108,34 92,34" />
        <Polygon points="100,22 94,40 110,29" />
        <Path d="M100 45 C110 55 130 55 145 45 L190 90 C170 100 150 95 138 85 L120 100 L130 130 L110 175 L100 190 L90 175 L70 130 L80 100 L62 85 C50 95 30 100 10 90 L55 45 C70 55 90 55 100 45 Z" />
      </G>
    </Svg>
  );
}
