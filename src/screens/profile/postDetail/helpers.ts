
// src/screens/profile/postDetail/helpers.ts

import type { CommentNode, CommentRow, ProfileLite, TranslateFn } from './types';

export const formatStampDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}. ${mm}. ${dd}`;
};

export const getDisplayName = (
  t: TranslateFn,
  isFriendOwner: boolean,
  profile: ProfileLite | null,
): string => {
  const noName = t('profile.no_name');
  if (!profile) return noName;
  return isFriendOwner
    ? profile.nickname || profile.follow_id || noName
    : profile.follow_id || profile.nickname || noName;
};

export const getInitialFromName = (name: string | null | undefined) => {
  const trimmed = (name || '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
};

export const buildCommentTree = (flat: CommentRow[]): CommentNode[] => {
  const nodeMap: Record<string, CommentNode> = {};
  const roots: CommentNode[] = [];

  flat.forEach((c) => {
    nodeMap[c.id] = { ...c, replies: [] };
  });

  flat.forEach((c) => {
    const node = nodeMap[c.id];
    if (!c.parent_id || !nodeMap[c.parent_id]) {
      roots.push(node);
    } else {
      nodeMap[c.parent_id].replies.push(node);
    }
  });

  const sortFn = (a: CommentNode, b: CommentNode) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

  const sortTree = (nodes: CommentNode[]) => {
    nodes.sort(sortFn);
    nodes.forEach((n) => {
      n.replies.sort(sortFn);
      if (n.replies.length > 0) sortTree(n.replies);
    });
  };

  sortTree(roots);
  return roots;
};
