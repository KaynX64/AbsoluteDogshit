// desktop/src/components/Icon.tsx
//
// Renders Material Symbols as ligatures from the variable font bundled by
// index.css. Fill, weight, grade, and optical size are configurable per icon.
// Use semantic theme tones or inherit the parent's current color.

import type { CSSProperties } from 'react';
import { T } from '../theme';

export type IconTone =
  | 'primary' | 'danger' | 'warning' | 'success' | 'info'
  | 'text' | 'muted' | 'sub' | 'inherit';

export interface IconProps {
  /** Material Symbols ligature name. Browse https://fonts.google.com/icons */
  name: string;
  /** Pixel size. Default 20. */
  size?: number;
  /** Font weight 100-700. Default 400 (normal). */
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700;
  /** Optical grade (-25 low-emphasis to 200 high-emphasis). Default 0. */
  grade?: number;
  /** Filled variant (true) or outlined (false, default). */
  fill?: boolean;
  /** Semantic color tone. Default 'inherit' (uses parent's currentColor). */
  tone?: IconTone;
  /** Extra inline styles. */
  style?: CSSProperties;
  /** Accessible label. If omitted, icon is decorative (aria-hidden). */
  'aria-label'?: string;
  className?: string;
}

// Tone → live token resolution. Built as a function (not a module-level
// record) so icon colors follow theme switches — a static record would
// freeze the palette that was active at module load.
function resolveToneColor(tone: Exclude<IconTone, 'inherit'>): string {
  switch (tone) {
    case 'primary': return T.primary;
    case 'danger':  return T.danger;
    case 'warning': return T.warning;
    case 'success': return T.success;
    case 'info':    return T.info;
    case 'text':    return T.text;
    case 'muted':   return T.textMuted;
    case 'sub':     return T.textSub;
  }
}

export default function Icon({
  name,
  size = 20,
  weight = 400,
  grade = 0,
  fill = false,
  tone = 'inherit',
  style,
  className,
  ...rest
}: IconProps) {
  const color = tone === 'inherit' ? undefined : resolveToneColor(tone);

  return (
    <span
      className={`material-symbols-outlined${className ? ' ' + className : ''}`}
      aria-hidden={rest['aria-label'] ? undefined : true}
      role={rest['aria-label'] ? 'img' : undefined}
      aria-label={rest['aria-label']}
      style={{
        fontVariationSettings: `'FILL ${fill ? 1 : 0}, wght ${weight}, GRAD ${grade}, opsz ${Math.min(size, 48)}`,
        fontSize: size,
        lineHeight: 1,
        display: 'inline-block',
        verticalAlign: 'middle',
        userSelect: 'none',
        color,
        ...style,
      }}
    >
      {name}
    </span>
  );
}

/* ── Convenience name map ─────────────────────────────────────────
 * Centralises the ligature names used across the app, so a typo in one
 * file doesn't silently render a "tofu" box. Import { IconNames } and
 * use <Icon name={IconNames.users} />.
 */
export const IconNames = {
  // Navigation / shell
  users:        'group',
  shield:       'shield',
  health:       'monitor_heart',
  analytics:    'monitoring',
  database:     'database',
  stethoscope:  'stethoscope',
  calendar:     'calendar_month',
  history:      'history',
  folder:       'folder',
  pill:         'medical_services',
  alert:        'emergency',
  key:          'key',
  logout:       'logout',
  help:         'help',
  refresh:      'refresh',
  search:       'search',
  plus:         'add',
  pencil:       'edit',
  trash:        'delete',
  lock:         'lock',
  chevronRight: 'chevron_right',
  chevronDown:  'expand_more',
  check:        'check',
  close:        'close',
  filter:       'filter_list',
  sort:         'sort',
  eye:          'visibility',
  eyeOff:       'visibility_off',
  download:     'download',
  upload:       'upload',
  uploadFile:   'upload_file',
  print:        'print',
  save:         'save',
  copy:         'content_copy',
  more:         'more_horiz',
  menu:         'menu',
  arrowRight:   'arrow_right_alt',
  arrowUp:      'arrow_upward',
  arrowDown:    'arrow_downward',
  arrowForward: 'arrow_forward',
  arrowBack:    'arrow_back',
  external:     'open_in_new',
  swap:         'swap_horiz',
  sync:         'sync',

  // Status / severity
  checkCircle:  'check_circle',
  cancel:       'cancel',
  error:        'error',
  warning:      'warning',
  info:         'info',
  success:      'task_alt',
  block:        'block',
  bolt:         'bolt',
  priorityHigh: 'priority_high',
  pending:      'pending',
  schedule:     'schedule',
  circle:       'circle',

  // People / roles
  person:       'person',
  personAdd:    'person_add',
  nurse:        'medical_information',
  doctor:       'medical_services',
  dentist:      'medical_information',
  responder:    'emergency',
  admin:        'admin_panel_settings',
  student:      'school',
  faculty:      'work',
  badge:        'badge',
  idCard:       'badge',
  contactPhone: 'contact_phone',
  contactless:  'contactless',

  // Clinical
  tooth:        'dentistry',
  prescription: 'receipt_long',
  vaccine:      'vaccines',
  bloodtype:    'bloodtype',
  medicines:    'medication',
  prescription2:'description',
  healthReport: 'medical_information',
  heart:        'favorite',
  heartPlus:    'health_and_safety',
  medicalClearance: 'medical_information',

  // Inventory
  inventory:    'inventory_2',
  inventoryAdd: 'inventory',
  package:      'inventory_2',
  category:     'category',
  warehouse:    'warehouse',
  restock:      'add_shopping_cart',
  lowStock:     'production_quantity_limits',
  expire:       'event_busy',

  // Communication / notifications
  bell:         'notifications',
  bellOff:      'notifications_off',
  chat:         'chat',
  mail:         'mail',
  phone:        'call',
  sms:          'sms',

  // Files
  file:         'draft',
  filePdf:      'picture_as_pdf',
  attachment:   'attach_file',
  image:        'image',
  camera:       'photo_camera',
  qrCode:       'qr_code_scanner',
  qrScan:       'qr_code',
  document:     'description',
  paper:        'article',
  book:         'menu_book',

  // Misc
  testTube:     'science',
  map:          'map',
  pin:          'location_on',
  location:     'my_location',
  navigate:     'navigation',
  gym:          'fitness_center',
  clock:        'schedule',
  calendarToday:'today',
  calendarEvent:'event',
  settings:     'settings',
  gear:         'settings',
  build:        'build',
  wrench:       'build_circle',
  palette:      'palette',
  eye2:         'visibility',
  visible:      'visibility',
  invisible:    'visibility_off',
  sparkle:      'auto_awesome',
  star:         'star',
  flag:         'flag',
  tag:          'label',
  label:        'label',
  link:         'link',
  externalLink: 'open_in_new',
  panel:        'space_dashboard',
  dashboard:    'dashboard',
  table:        'table_chart',
  list:         'list',
  grid:         'grid_view',
  card:         'card_membership',
  card2:        'credit_card',
  school:       'school',
  hospital:     'local_hospital',
  building:     'apartment',
  business:     'business',
  campus:       'school',
  globe:        'public',
  language:     'language',
  save2:        'save',
  saveAlt:      'save_alt',
  inbox:        'inbox',
  outbox:       'outbox',
  archive:      'archive',
  delete2:      'delete_outline',
  edit:         'edit',
  edit2:        'edit_note',
  note:         'note',
  noteAdd:      'note_add',
  note2:        'sticky_note_2',
  print2:       'print_disabled',
  scan:         'document_scanner',
  zoom:         'zoom_in',
  zoomOut:      'zoom_out',
  fit:          'fit_screen',
  full:         'fullscreen',
  exit:         'close_fullscreen',
  pip:          'picture_in_picture',
  pen:          'edit',
  signature:    'draw',
  draw:         'draw',
  brush:        'brush',
  layers:       'layers',
  stack:        'stacked_bar_chart',
  flow:         'account_tree',
  tree:         'schema',
  network:      'hub',
  shield2:      'verified_user',
  shieldUser:   'admin_panel_settings',
  shieldCheck:  'verified_user',
  fingerprint:  'fingerprint',
  face:         'face',
  faceId:       'face',
  keyOff:       'key_off',
  password:     'password',
  pin2:         'pin',
  pass:         'pin',
  invite:       'mail',
  share:        'share',
  share2:       'share',
  download2:    'cloud_download',
  cloud:        'cloud',
  cloudOff:     'cloud_off',
  cloudDone:    'cloud_done',
  syncProblem:  'sync_problem',
  syncDisabled: 'sync_disabled',
  wifi:         'wifi',
  wifiOff:      'wifi_off',
  cellular:     'signal_cellular_alt',
  battery:      'battery_full',
  batteryLow:   'battery_alert',
  plug:         'power',
  power:        'power',
  bolt2:        'power',
  networkCheck: 'network_check',
  speed:        'speed',
  gauge:        'speed',
  pulse:        'monitor_heart',
  heartbeat:    'monitor_heart',
  healthMetric: 'monitoring',
  chartLine:    'show_chart',
  chartBar:     'bar_chart',
  chartPie:     'pie_chart',
  chartScatter: 'scatter_plot',
  trendUp:      'trending_up',
  trendDown:    'trending_down',
  trendFlat:    'trending_flat',
  activity:     'activity',
  lightbulb:    'lightbulb',
  idea:         'lightbulb',
  info2:        'info',
  help2:        'help_outline',
  question:     'help_outline',
  support:      'support_agent',
  agent:        'support_agent',
  contact:      'contact_support',
  feedback:     'feedback',
  review:       'reviews',
  rate:         'star_rate',
  thumbUp:      'thumb_up',
  thumbDown:    'thumb_down',
  recommend:    'recommend',
} as const;

export type IconName = keyof typeof IconNames;
