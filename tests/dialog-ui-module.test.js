import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearCompactDialogSize,
  dialogSafeInitialFocus,
  dialogTextEntry,
  sizeCompactDialog,
  syncDialogScrollLock,
} from '../public/dialog-ui.mjs';

const styleStore = () => {
  const values = new Map();
  return {
    values,
    removed: [],
    setProperty(name, value, priority = '') { values.set(name, { value, priority }); },
    removeProperty(name) { this.removed.push(name); values.delete(name); if (name === 'display') this.display = ''; },
  };
};

test('紧凑弹窗尺寸包含子元素外边距、向上取整并受视口上限约束', () => {
  const style = styleStore();
  const dialog = {
    id: 'tag-picker-dialog', open: true, style,
    children: [
      { offsetHeight: 100, margins: { marginTop: '4.25px', marginBottom: '5.25px' } },
      { offsetHeight: 200, margins: { marginTop: '2px', marginBottom: '3px' } },
    ],
  };
  sizeCompactDialog(dialog, {
    viewportHeight: 320,
    computedStyle: node => node.margins,
  });
  assert.deepEqual(style.values.get('height'), { value: '296px', priority: 'important' });
  assert.deepEqual(style.values.get('max-height'), { value: '296px', priority: 'important' });
  assert.equal(style.display, 'block');
});

test('紧凑弹窗辅助只操作允许且已打开的弹窗，并可清理内联尺寸', () => {
  const style = styleStore();
  const closed = { id: 'tag-picker-dialog', open: false, style, children: [] };
  sizeCompactDialog(closed, { viewportHeight: 800, computedStyle: () => ({}) });
  assert.equal(style.values.size, 0);
  const ordinary = { id: 'editor', open: true, style, children: [] };
  sizeCompactDialog(ordinary, { viewportHeight: 800, computedStyle: () => ({}) });
  assert.equal(style.values.size, 0);
  style.display = 'block';
  style.setProperty('height', '240px', 'important');
  style.setProperty('max-height', '776px', 'important');
  clearCompactDialogSize({ id: 'tag-picker-dialog', style });
  assert.deepEqual(style.removed, ['display', 'height', 'max-height']);
  assert.equal(style.display, '');
  assert.equal(style.values.has('height'), false);
  assert.equal(style.values.has('max-height'), false);
});

test('弹窗初始焦点避免文本输入，优先标题并保持既有tabindex', () => {
  const title = {
    attrs: new Map(),
    hasAttribute(name) { return this.attrs.has(name); },
    setAttribute(name, value) { this.attrs.set(name, value); },
  };
  const documentRef = { getElementById: id => id === 'dialog-title' ? title : null };
  const dialog = {
    getAttribute: name => name === 'aria-labelledby' ? 'dialog-title' : null,
    querySelector: () => null,
  };
  const input = { matches: () => true };
  assert.equal(dialogTextEntry(input), true);
  assert.equal(dialogSafeInitialFocus(dialog, input, documentRef), title);
  assert.equal(title.attrs.get('tabindex'), '-1');
  title.attrs.set('tabindex', '0');
  assert.equal(dialogSafeInitialFocus(dialog, input, documentRef), title);
  assert.equal(title.attrs.get('tabindex'), '0');
  const button = { matches: () => false };
  assert.equal(dialogSafeInitialFocus(dialog, button, documentRef), button);
});

test('弹窗滚动锁由任一打开弹窗统一驱动', () => {
  const toggles = [];
  const documentRef = {
    querySelector: selector => selector === 'dialog[open]' ? {} : null,
    documentElement: { classList: { toggle: (name, value) => toggles.push(['html', name, value]) } },
    body: { classList: { toggle: (name, value) => toggles.push(['body', name, value]) } },
  };
  syncDialogScrollLock(documentRef);
  assert.deepEqual(toggles, [
    ['html', 'dialog-scroll-lock', true],
    ['body', 'dialog-scroll-lock', true],
  ]);
});
