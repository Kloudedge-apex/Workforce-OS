export type WorkflowCapability = boolean | null | undefined;

export function canManageWorkflow(
  capability: WorkflowCapability,
): capability is true {
  return capability === true;
}

export function workflowAuthorityMessage(
  capability: WorkflowCapability,
): string {
  return capability === false
    ? "Only a workspace owner, administrator, or manager can change the ICP or start a pipeline run."
    : "Workflow management permissions could not be verified. ICP editing and run start remain disabled.";
}
