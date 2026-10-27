import { createLucideIcon } from 'lucide-react'

/** Balde (o lucide não tem um ícone de bucket). Mesmo desenho do favicon. */
export const BucketIcon = createLucideIcon('bucket', [
  ['path', { d: 'M3 7l1.8 12.2A2 2 0 0 0 6.8 21h10.4a2 2 0 0 0 2-1.8L21 7', key: 'b1' }],
  ['ellipse', { cx: '12', cy: '7', rx: '9', ry: '3', key: 'b2' }],
])
