/**
 * Type declarations for @react-native-community/slider
 */

declare module '@react-native-community/slider' {
  import { Component } from 'react';
  import { ViewProps, StyleProp, ViewStyle } from 'react-native';

  export interface SliderProps extends ViewProps {
    value?: number;
    minimumValue?: number;
    maximumValue?: number;
    step?: number;
    onValueChange?: (value: number) => void;
    onSlidingStart?: (value: number) => void;
    onSlidingComplete?: (value: number) => void;
    disabled?: boolean;
    minimumTrackTintColor?: string;
    maximumTrackTintColor?: string;
    thumbTintColor?: string;
    style?: StyleProp<ViewStyle>;
    inverted?: boolean;
    vertical?: boolean;
  }

  export default class Slider extends Component<SliderProps> {}
}
