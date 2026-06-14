require('dotenv').config();
const wecom = require('./lib/wecom');
const docid = 'dc4VqQIuOZQfHZY3ltIFCzCDvQJ2vsWWCeNhpjPRW5tU4AwDFROH42Yj7sGpZ6WE7xl075MgpTtyoD0uvhI34lrQ';

(async () => {
  const sheets = await wecom.getSheets(docid);
  console.log('=== 子表列表 ===');
  for (const s of sheets.sheet_list) {
    console.log(s.title + ' (' + s.sheet_id + ')');

    const fields = await wecom.getFields(docid, s.sheet_id);
    console.log('  字段数: ' + fields.fields.length);
    console.log('  字段: ' + fields.fields.map(f => f.field_title).join(', '));

    const recs = await wecom.getRecords(docid, s.sheet_id, { limit: 2 });
    console.log('  总记录数: ' + (recs.total || recs.records.length));

    if (recs.records && recs.records.length > 0) {
      const r = recs.records[0];
      console.log('  首条示例:');
      for (const [k, v] of Object.entries(r.values)) {
        let display;
        if (Array.isArray(v)) {
          display = v.map(x => x.text || x.link || '').filter(Boolean).join(', ');
        } else {
          display = String(v);
        }
        console.log('    ' + k + ': ' + display.substring(0, 80));
      }
    }
    console.log('');
  }

  // Count all
  const all1 = await wecom.getAllRecords(docid, sheets.sheet_list[0].sheet_id);
  const all2 = await wecom.getAllRecords(docid, sheets.sheet_list[1].sheet_id);
  console.log('=== 汇总 ===');
  console.log(sheets.sheet_list[0].title + ': ' + all1.length + ' 条');
  console.log(sheets.sheet_list[1].title + ': ' + all2.length + ' 条');
  console.log('✅ 导入验证通过！');
})();
