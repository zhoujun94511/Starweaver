import assert from 'node:assert/strict';
import { RenderActivity } from '../src/utils/renderActivity.js';

const activity = new RenderActivity();
// Native gameplay frames are never dropped on 60/90 Hz, including Low quality.
for (let frame = 0; frame < 180; frame++) assert(activity.shouldRender(false, false, 0, 1));
assert(activity.shouldRender(false, true, 0, 1), 'Paint the pause entry once');
for (let frame = 0; frame < 180; frame++) assert.equal(activity.shouldRender(false, true, 0, 1), false);
assert(activity.shouldRender(false, true, 1, 1), 'Resize/quality/rescue changes repaint while paused');
assert.equal(activity.shouldRender(false, true, 1, 1), false);
assert(activity.shouldRender(false, true, 1, 2), 'State and preference changes repaint while paused');
for (let frame = 0; frame < 180; frame++) assert.equal(activity.shouldRender(true, false, 1, 2), false);
assert(activity.shouldRender(false, true, 1, 2), 'Foreground return refreshes paused image');
assert(activity.shouldRender(false, false, 1, 2), 'Resume immediately renders');
assert(activity.shouldRender(false, true, 1, 2));
// Background RAF may stop completely, so foreground changes the revision.
assert.equal(activity.shouldRender(false, true, 1, 2), false);
assert(activity.shouldRender(false, true, 2, 2), 'Foreground invalidation works without any hidden RAF callbacks');
console.log('✓ Paused/hidden scenes stop rendering; state, resize and resume invalidate correctly; native gameplay cadence preserved.');
