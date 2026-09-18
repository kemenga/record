'use strict';
Component({
  options: { addGlobalClass: true },
  properties: {
    item: { type: Object, value: {} }
  },
  methods: {
    onTap() {
      this.triggerEvent('cardtap', { id: this.data.item.id });
    }
  }
});
