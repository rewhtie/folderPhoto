// 统一管理扫描的文件名关键词和对应 Tab 显示标签
// keys 是完整文件名（精确匹配），values 是 Tab 显示名
// 按显示顺序排列
export const FILE_NAME_CONFIG: Record<string, string> = {
  'library_hero.jpg': '背景',
  'library_hero_schinese.jpg': '背景',
  'library_header.jpg': '宽幅封面图片',
  'header_schinese.jpg': '宽幅封面图片-中文',
  'library_header_schinese.jpg': '宽幅封面图片-中文',
  'header.jpg': '宽幅封面图片',
  'logo_schinese.png': '徽标',
  'library_capsule.jpg': '封面图片',
  'library_capsule_schinese.jpg': '封面图片-中文',
  'library_600x900_schinese.jpg': '封面图片-中文',
  'library_600x900.jpg': '封面图片',
}

// 后端用的关键词列表
export const SCAN_KEYWORDS = Object.keys(FILE_NAME_CONFIG)
