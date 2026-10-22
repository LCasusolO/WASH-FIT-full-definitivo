const test=require('node:test'),assert=require('node:assert/strict'),Core=require('../js/core.js');
test('Backspace deletes empty bullets and joins list lines without restoring their prefix',()=>{
 assert.deepEqual(Core.bulletBackspace('• ',2),{value:'',caret:0});
 assert.deepEqual(Core.bulletBackspace('• Uno\n• ',8),{value:'• Uno',caret:5});
 assert.deepEqual(Core.bulletBackspace('• Uno\n• Dos',8),{value:'• UnoDos',caret:5});
 assert.deepEqual(Core.bulletBackspace('• Uno',2),{value:'Uno',caret:0});
 assert.equal(Core.bulletBackspace('• Uno',5),null);
 assert.equal(Core.bulletBackspace('• Uno',0,5),null);
});
