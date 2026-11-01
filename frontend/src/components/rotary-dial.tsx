/**
 * components/rotary-dial.tsx — The "rotary phone" ring of circles.
 *
 * Used twice:
 *   - Begin screen (app/begin.tsx): workouts on an evenly spaced ring. Drag
 *     the ring until the workout you want sits at the TOP, then tap it.
 *   - Session screen (app/session/[id].tsx): exercises on a ring where the
 *     one at the top is drawn BIG (it's the one you're working on) and the
 *     rest are small and fan out around the bottom, like the wireframe.
 *
 * ─── How it works ───────────────────────────────────────────────────────────
 *
 * 1. POSITION. The whole ring is described by ONE number, `position`.
 *    position = 2 means item #2 is exactly at the top. position = 2.5 means
 *    the ring is halfway between item 2 and item 3 (mid-drag). Everything
 *    else (each node's angle and size) is calculated from it.
 *
 * 2. OFFSET. For item i, offset = i - position, wrapped into the range
 *    [-n/2, n/2] so the ring is circular (the last item sits next to the
 *    first). offset 0 = at the top, -1 = one step counter-clockwise, etc.
 *
 * 3. ANGLE. offset → angle around the circle (0° = top, clockwise positive):
 *      - 'even' layout:  angle = offset × (360° / n)      (uniform spacing)
 *      - 'focus' layout: neighbours of the top item are pushed out to
 *        `focusGapDegrees` so they clear the big circle, and the remaining
 *        items share the rest of the ring evenly.
 *    Then x = cx + r·sin(angle), y = cy − r·cos(angle).
 *
 * 4. SIZE. focus = 1 − |offset| (clamped at 0). The top item has focus 1 and
 *    gets `activeNodeSize`; items one step away or more get `nodeSize`;
 *    in-between sizes are blended while dragging, so the circles smoothly
 *    grow/shrink as they pass through the top.
 *
 * 5. DRAGGING. A PanResponder (React Native's built-in touch handler) tracks
 *    the finger's ANGLE around the ring's centre. Turning the finger by one
 *    "step" (360° / n) moves position by 1, exactly like a rotary dial.
 *    On release the ring snaps to the nearest whole position.
 *
 * 6. TAPS. Tapping the top node calls `onPressActive` (e.g. start that
 *    workout). Tapping any other node spins it to the top.
 *
 * Animation uses React Native's Animated API with a listener that copies the
 * animated value into React state each frame. With at most a dozen or so
 * nodes that's plenty fast, and it means the maths above is ordinary
 * JavaScript instead of animation-library worklets.
 */
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type ViewStyle,
} from 'react-native';

/** Extra info handed to renderNode so each node can draw itself. */
export type DialNodeInfo = {
  index: number;
  isActive: boolean; // this node is the one at the top (after snapping)
  focus: number;     // 0..1 — how close to the top it is right now (1 = at the top)
  size: number;      // current diameter in points
};

type RotaryDialProps<T> = {
  items: readonly T[];
  keyOf: (item: T) => string;
  /** Which item is at the top. The parent owns this value (a "controlled" component). */
  activeIndex: number;
  /** Called as soon as the ring settles on a new top item. */
  onActiveIndexChange: (index: number) => void;
  /** Tap on the top item. Leave undefined to make the top node non-pressable (lets TextInputs inside it work). */
  onPressActive?: (item: T, index: number) => void;
  renderNode: (item: T, info: DialNodeInfo) => ReactNode;
  accessibilityLabelOf?: (item: T) => string;

  width: number;
  height: number;
  /** Ring centre inside the box. Defaults to the middle. */
  centerX?: number;
  centerY?: number;
  /** Ring radius (distance from centre to each node's centre). */
  radius: number;
  /** Diameter of ordinary nodes (shrinks automatically if they'd overlap). */
  nodeSize: number;
  /** Diameter of the node at the top. */
  activeNodeSize: number;
  layout?: 'even' | 'focus';
  /** 'focus' layout only: angle between the top node and its neighbours. */
  focusGapDegrees?: number;
  /** Drawn behind the nodes, centred on the ring (e.g. the selected workout's name). */
  children?: ReactNode;
};

const SNAP_MS = 260;
const DRAG_START_PX = 8; // finger must move this far before it counts as a drag (so taps still work)

/** Proper modulo that never returns negatives: mod(-1, 5) = 4 (JS's % gives -1). */
function mod(value: number, n: number): number {
  return ((value % n) + n) % n;
}

/** Wrap an offset into [-n/2, n/2] — the shortest way around the ring. */
function wrapOffset(offset: number, n: number): number {
  const m = mod(offset, n);
  return m > n / 2 ? m - n : m;
}

/** Wrap an angle difference into (-180, 180] so crossing the bottom of the ring doesn't jump by 360°. */
function wrapDegrees(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/** Spacing (degrees) of the non-neighbour nodes in the 'focus' layout. */
function restStepDegrees(n: number, gap: number): number {
  const maxOffset = n / 2;
  return maxOffset > 1 ? (180 - gap) / (maxOffset - 1) : 0;
}

/** Step 3 in the header comment: offset → angle in degrees. */
function angleForOffset(offset: number, n: number, layout: 'even' | 'focus', gap: number): number {
  if (layout === 'even' || n < 3) return offset * (360 / n);
  const abs = Math.abs(offset);
  const sign = Math.sign(offset);
  if (abs <= 1) return offset * gap;
  return sign * (gap + (abs - 1) * restStepDegrees(n, gap));
}

export function RotaryDial<T>(props: RotaryDialProps<T>) {
  const {
    items, keyOf, activeIndex, renderNode, accessibilityLabelOf,
    width, height, radius, nodeSize, activeNodeSize, children,
    layout = 'even', focusGapDegrees = 72,
  } = props;
  const n = items.length;
  const cx = props.centerX ?? width / 2;
  const cy = props.centerY ?? height / 2;

  // ---- Position state ---------------------------------------------------
  // `anim` drives animations; `position` is a React copy used for rendering;
  // `positionRef` is a non-rendering copy the touch handlers can read
  // synchronously (state updates are asynchronous).
  const anim = useRef(new Animated.Value(activeIndex)).current;
  const [position, setPosition] = useState(activeIndex);
  const positionRef = useRef(activeIndex);

  useEffect(() => {
    const id = anim.addListener(({ value }) => {
      positionRef.current = value;
      setPosition(value);
    });
    return () => anim.removeListener(id);
  }, [anim]);

  // The PanResponder is created once, so it reads the latest props via a ref
  // instead of capturing stale ones.
  const propsRef = useRef(props);
  propsRef.current = props;

  /** Spin to `target` (an unwrapped position) and tell the parent which item is now on top. */
  const animateTo = (target: number) => {
    const count = propsRef.current.items.length;
    if (count === 0) return;
    propsRef.current.onActiveIndexChange(mod(Math.round(target), count));
    Animated.timing(anim, {
      toValue: target,
      duration: SNAP_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // we read the value in JS every frame, so the native driver can't be used
    }).start();
  };

  // If the PARENT changes activeIndex (e.g. auto-advance after finishing an
  // exercise), spin there the short way round. If we caused the change
  // ourselves, the item is already at the top and nothing happens.
  useEffect(() => {
    if (n === 0) return;
    const current = mod(Math.round(positionRef.current), n);
    if (current !== activeIndex) {
      const delta = wrapOffset(activeIndex - current, n);
      animateTo(Math.round(positionRef.current) + delta);
    }
    // animateTo is recreated each render but only uses refs, so it's safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, n]);

  // ---- Dragging ---------------------------------------------------------
  // Where the dial's top-left corner is on screen, so a finger's page
  // coordinates can be turned into an angle around the ring's centre.
  // ComponentRef<typeof View> = the type of the native view instance (RN 0.8x views are function components).
  const containerRef = useRef<ComponentRef<typeof View>>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const measure = () => containerRef.current?.measureInWindow((x, y) => { originRef.current = { x, y }; });

  /** Angle (0° = top, clockwise) of a touch point around the ring centre. */
  const touchAngle = (event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    const p = propsRef.current;
    const dx = pageX - (originRef.current.x + (p.centerX ?? p.width / 2));
    const dy = pageY - (originRef.current.y + (p.centerY ?? p.height / 2));
    return { angle: (Math.atan2(dx, -dy) * 180) / Math.PI, distance: Math.hypot(dx, dy) };
  };

  const drag = useRef({ lastAngle: 0, startPosition: 0, turned: 0 });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Don't grab plain taps (so the nodes' Pressables and TextInputs get
        // them)... but DO grab the touch once the finger moves, even if it
        // started on a node ("Capture" = parent gets first say).
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > DRAG_START_PX,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > DRAG_START_PX,
        onPanResponderTerminationRequest: () => false, // keep the gesture once we have it

        onPanResponderGrant: (event) => {
          measure(); // refresh in case the layout moved (e.g. keyboard)
          anim.stopAnimation(); // stop any snap in progress so the finger takes over
          drag.current = { lastAngle: touchAngle(event).angle, startPosition: positionRef.current, turned: 0 };
        },

        onPanResponderMove: (event) => {
          const count = propsRef.current.items.length;
          if (count === 0) return;
          const { angle, distance } = touchAngle(event);
          // Very close to the centre the angle swings wildly; ignore those points.
          if (distance < 24) return;
          // Accumulate the change since the last event (wrapped so crossing
          // ±180° doesn't count as a full turn).
          drag.current.turned += wrapDegrees(angle - drag.current.lastAngle);
          drag.current.lastAngle = angle;
          // Clockwise finger movement carries the items clockwise, which brings
          // LOWER indexes to the top — hence the minus sign.
          const stepDegrees = 360 / count;
          anim.setValue(drag.current.startPosition - drag.current.turned / stepDegrees);
        },

        onPanResponderRelease: () => animateTo(Math.round(positionRef.current)),
        onPanResponderTerminate: () => animateTo(Math.round(positionRef.current)),
      }),
    // Created once; everything it needs is read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ---- Layout of each node ---------------------------------------------
  // Shrink the small nodes if the ring is crowded, so they never overlap.
  const smallestStep = layout === 'focus' && n >= 3 ? Math.min(restStepDegrees(n, focusGapDegrees) || 360, focusGapDegrees) : 360 / Math.max(n, 1);
  const arcLength = radius * (smallestStep * Math.PI) / 180;
  const smallSize = Math.max(28, Math.min(nodeSize, arcLength * 0.82));
  const settledIndex = n === 0 ? -1 : mod(Math.round(position), n);

  const nodes = items.map((item, index) => {
    const offset = n === 1 ? 0 : wrapOffset(index - position, n);
    const angle = (angleForOffset(offset, n, layout, focusGapDegrees) * Math.PI) / 180;
    const focus = Math.max(0, 1 - Math.abs(offset));
    const size = smallSize + (activeNodeSize - smallSize) * focus;
    const x = cx + radius * Math.sin(angle);
    const y = cy - radius * Math.cos(angle);
    const isActive = index === settledIndex;
    const info: DialNodeInfo = { index, isActive, focus, size };

    const placement: ViewStyle = {
      position: 'absolute',
      left: x - size / 2,
      top: y - size / 2,
      width: size,
      height: size,
      zIndex: Math.round(focus * 10) + 1, // the growing node is drawn on top
    };

    // Top node with no tap action → plain View so inputs inside it work.
    if (isActive && !props.onPressActive) {
      return <View key={keyOf(item)} style={placement}>{renderNode(item, info)}</View>;
    }
    return (
      <Pressable
        key={keyOf(item)}
        style={placement}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabelOf?.(item)}
        accessibilityHint={isActive ? 'Opens this item' : 'Turns the dial to this item'}
        onPress={() => {
          if (isActive) propsRef.current.onPressActive?.(item, index);
          else animateTo(Math.round(positionRef.current) + wrapOffset(index - positionRef.current, n));
        }}>
        {renderNode(item, info)}
      </Pressable>
    );
  });

  return (
    <View
      ref={containerRef}
      onLayout={measure}
      style={[{ width, height }, styles.container, webNoScroll]}
      {...panResponder.panHandlers}>
      {/* Faint guide circle showing the "track" the nodes ride on. */}
      <View
        pointerEvents="none"
        style={[styles.track, { left: cx - radius, top: cy - radius, width: radius * 2, height: radius * 2, borderRadius: radius }]}
      />
      {children ? (
        <View pointerEvents="box-none" style={[styles.center, { left: cx - radius, top: cy - radius, width: radius * 2, height: radius * 2 }]}>
          {children}
        </View>
      ) : null}
      {nodes}
    </View>
  );
}

// On the web, stop the browser from scrolling/zooming the page while the
// user drags the dial. (`touchAction` is a web-only style, hence the cast.)
const webNoScroll = (Platform.OS === 'web' ? { touchAction: 'none', userSelect: 'none' } : {}) as ViewStyle;

const styles = StyleSheet.create({
  container: { position: 'relative', alignSelf: 'center' },
  track: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(128,128,128,0.25)' },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
