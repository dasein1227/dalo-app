import React from 'react';

import MessageItemView, {
  areMessageItemPropsEqual,
  type MessageItemProps,
} from './MessageItemView';

// Performance note:
// useChatMessages already observes the room-level WatermelonDB query and rebuilds
// the render items when rows change. Keeping one WatermelonDB/RxJS observe()
// subscription per visible/recycled message row adds mount/unmount churn while
// scrolling and can make the list feel progressively heavier after repeated
// back-and-forth scrolls.
//
// This component intentionally stays as a pure memoized view wrapper.
// If a future edge case requires per-row observation again, reintroduce it only
// behind a narrow flag for the affected message kinds/statuses.

export default React.memo<MessageItemProps>(MessageItemView, areMessageItemPropsEqual);
