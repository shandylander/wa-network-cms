import React, { useState, useMemo } from 'react';
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission, TEAMS } from '../../utils/permissions';
import { getStageStatus } from '../../utils/helpers';
import BlockModal from './BlockModal';
import styles from './BlockKanban.module.css';

const COLUMNS = [
  { id: 'not-started',     label: 'Not Started',    color: 'grey'   },
  { id: 'in-progress',     label: 'In Progress',    color: 'amber'  },
  { id: 'stage1-complete', label: 'Stage 1 Done',   color: 'blue'   },
  { id: 'stage2-complete', label: 'Stage 2 Done',   color: 'green'  },
];

const COLUMN_FIX = {
  'not-started':     { fix1: 0,   fix2: 0,   fix3: 0,   fix4: 0   },
  'in-progress':     { fix1: 50,  fix2: 0,   fix3: 0,   fix4: 0   },
  'stage1-complete': { fix1: 100, fix2: 100, fix3: 0,   fix4: 0   },
  'stage2-complete': { fix1: 100, fix2: 100, fix3: 100, fix4: 100 },
};

function KanbanColumn({ col, blocks, onCardClick, activeId }) {
  const { isOver, setNodeRef } = useDroppable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      className={[styles.col, isOver ? styles.colOver : '', styles[`col_${col.color}`]].join(' ')}
    >
      <div className={styles.colHeader}>
        <span className={styles.colTitle}>{col.label}</span>
        <span className={styles.colCount}>{blocks.length}</span>
      </div>
      <div className={styles.colBody}>
        {blocks.map(b => (
          <BlockCard
            key={b.id}
            block={b}
            onClick={() => onCardClick(b)}
            isDragging={activeId === b.id}
          />
        ))}
        {blocks.length === 0 && (
          <div className={styles.colEmpty}>Drop blocks here</div>
        )}
      </div>
    </div>
  );
}

function BlockCard({ block, onClick, isDragging, asOverlay }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: block.id });
  const style = !asOverlay && transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <div
      ref={asOverlay ? undefined : setNodeRef}
      style={style}
      className={[
        styles.card,
        isDragging  ? styles.cardDragging  : '',
        asOverlay   ? styles.cardOverlay   : '',
      ].filter(Boolean).join(' ')}
      {...(asOverlay ? {} : { ...listeners, ...attributes })}
      onClick={onClick}
    >
      <div className={styles.cardNo}>{block.no}</div>
      <div className={styles.cardStreet}>{block.street}</div>
      {block.team && (
        <div className={styles.cardTeam}>{TEAMS[block.team] ?? block.team}</div>
      )}
      {block.cam > 0 && (
        <div className={styles.cardCam}>🎥 {block.cam}{block.rack ? ` (${block.rack})` : ''}</div>
      )}
    </div>
  );
}

export default function BlockKanban({ projectId, blocks, setBlocks, userRole, userTeam }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const [activeBlock,   setActiveBlock]   = useState(null); // for DragOverlay
  const [editBlock,     setEditBlock]     = useState(null); // for BlockModal

  const isWorker = ['staff', 'subcon-admin', 'subcon'].includes(userRole);
  const canEdit  = hasPermission(userRole, 'update:blocks');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const visibleBlocks = useMemo(() => {
    if (isWorker && userTeam && userTeam !== 'none') {
      return blocks.filter(b => b.team === userTeam);
    }
    return blocks;
  }, [blocks, isWorker, userTeam]);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(COLUMNS.map(c => [c.id, []]));
    visibleBlocks.forEach(b => {
      const stage = getStageStatus(b);
      if (map[stage]) map[stage].push(b);
    });
    return map;
  }, [visibleBlocks]);

  const handleDragStart = (event) => {
    const block = blocks.find(b => b.id === event.active.id);
    setActiveBlock(block ?? null);
  };

  const handleDragEnd = async (event) => {
    setActiveBlock(null);
    const { active, over } = event;
    if (!over) return;

    const blockId   = active.id;
    const targetCol = over.id;
    const block     = blocks.find(b => b.id === blockId);
    if (!block) return;

    const currentStage = getStageStatus(block);
    if (currentStage === targetCol) return; // no change

    if (!canEdit) return;
    if (isWorker && block.team !== userTeam) return;

    const fixes = COLUMN_FIX[targetCol];
    if (!fixes) return;

    const updates = { ...fixes, updatedAt: new Date(), updatedBy: userProfile.userId };

    // Optimistic update
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ...updates } : b));

    try {
      await updateDoc(doc(db, 'projects', projectId, 'blocks', blockId), updates);
      toast.success(`Block ${block.no} → ${COLUMNS.find(c => c.id === targetCol)?.label}`);
    } catch {
      // Revert on failure
      setBlocks(prev => prev.map(b => b.id === blockId ? block : b));
      toast.error('Failed to update block');
    }
  };

  const handleSaved = (updated) => {
    setBlocks(prev => prev.map(b => b.id === updated.id ? updated : b));
    setEditBlock(null);
  };

  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>Drag blocks between columns to update stage. Click a card to edit details.</p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.board}>
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.id}
              col={col}
              blocks={grouped[col.id] ?? []}
              onCardClick={(b) => setEditBlock(b)}
              activeId={activeBlock?.id}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeBlock && (
            <BlockCard block={activeBlock} onClick={() => {}} asOverlay />
          )}
        </DragOverlay>
      </DndContext>

      {editBlock && (
        <BlockModal
          block={editBlock}
          projectId={projectId}
          onClose={() => setEditBlock(null)}
          onSaved={handleSaved}
          onDeleted={(id) => { setBlocks(prev => prev.filter(b => b.id !== id)); setEditBlock(null); }}
          userRole={userRole}
          userTeam={userTeam}
          existingStreets={[...new Set(blocks.map(b => b.street).filter(Boolean))].sort()}
        />
      )}
    </div>
  );
}
