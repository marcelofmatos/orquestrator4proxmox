export interface TagPolicy { clientTag: string; hiddenTags: string[]; }
export interface TaggedVm { tags?: string; template?: number; }

export function parseTags(tags?: string): string[] {
  if (!tags) return [];
  return tags.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
}

export function isClientVisible(vm: TaggedVm, policy: TagPolicy): boolean {
  if (vm.template === 1) return false;
  const tags = parseTags(vm.tags);
  if (!tags.includes(policy.clientTag)) return false;
  if (tags.some((t) => policy.hiddenTags.includes(t))) return false;
  return true;
}

export function filterVisible<T extends TaggedVm>(vms: T[], policy: TagPolicy): T[] {
  return vms.filter((vm) => isClientVisible(vm, policy));
}
