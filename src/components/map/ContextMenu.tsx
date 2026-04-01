import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { sendCommand } from '@/store/bridge'

interface ContextMenuProps {
  x: number
  y: number
  lngLat: { lng: number; lat: number }
  onClose: () => void
}

export default function ContextMenu({ x, y, lngLat, onClose }: ContextMenuProps) {
  const selectedId = useUIStore((s) => s.selectedUnitId)
  const units = useGameStore((s) => s.viewState.units)
  const unit = units.find((u) => u.id === selectedId)

  if (!unit) return null

  const canMove = unit.category !== 'airbase' && unit.category !== 'sam_site'

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--panel-radius)',
        padding: 4,
        zIndex: 100,
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-sm)',
        minWidth: 140,
      }}
      onMouseLeave={onClose}
    >
      {canMove && (
        <MenuItem
          label={`Move ${unit.name.split(' ')[0]}`}
          onClick={() => {
            sendCommand({
              type: 'MOVE_UNIT',
              unitId: unit.id,
              waypoints: [{ lat: lngLat.lat, lng: lngLat.lng }],
            })
            onClose()
          }}
        />
      )}
      <MenuItem
        label="Cancel"
        onClick={onClose}
        muted
      />
    </div>
  )
}

function MenuItem({ label, onClick, muted }: { label: string; onClick: () => void; muted?: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '4px 8px',
        cursor: 'pointer',
        color: muted ? 'var(--text-muted)' : 'var(--text-primary)',
        borderRadius: 3,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {label}
    </div>
  )
}
