const test=require('node:test'),assert=require('node:assert/strict'),Core=require('../js/core.js');
test('bullet editing handles plain text, multiline paste and existing bullets without duplication',()=>{
 assert.equal(Core.bulletEdit('Personal\n- Jabón\n• Agua').value,'• Personal\n• Jabón\n• Agua');
 assert.equal(Core.bulletEdit('• Personal\n• ').value,'• Personal\n• ');
 assert.equal(Core.bulletEdit('').value,'');
 assert.equal(Core.bulletEdit('1.000 L\n2. Jabón').value,'• 1.000 L\n• Jabón');
 assert.equal(Core.bulletHasContent('• \n• '),false);
 assert.equal(Core.bulletHasContent('• Personal'),true);
});
test('bullet editing preserves caret positions when prefixes are added and an item is split',()=>{
 assert.equal(Core.bulletEdit('Agua',2).caret,4);
 assert.equal(Core.bulletEdit('Agua\nJabón',7).caret,11);
 assert.equal(Core.bulletEdit('• Agua\n• ').caret,9);
 assert.equal(Core.bulletEdit('• Ag\n• ua',7).value,'• Ag\n• ua');
});
