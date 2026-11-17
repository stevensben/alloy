import { useMemo } from "react";

import { pickableProjectGroups } from "@t3tools/client-runtime/state/project-grouping";

import { Toolbar } from "../../components/ui/Toolbar";
import { homeListFilterEnvironments } from "../../features/home/home-list-filter-menu";
import { useHomeListOptions } from "../../features/home/home-list-options";
import {
  buildHomeProjectScopes,
  resolveHomeProjectFilterScope,
  sortHomeProjectScopes,
} from "../../features/home/homeThreadList";
import { useProjects } from "../../state/entities";
import { useWorkspaceState } from "../../state/workspace";

/**
 * The environment and project filters as two native header menus sharing one glass capsule.
 * NativeHeaderToolbar reads its children's element types, so this returns elements rather than
 * a component. Projects sort without thread activity so streaming turns never rebuild the header.
 */
export function useHomeScopeMenus() {
  const projects = useProjects();
  const environments = homeListFilterEnvironments(useWorkspaceState().environments);
  const availableEnvironmentIds = useMemo(
    () => new Set(environments.map((environment) => environment.environmentId)),
    [environments],
  );
  const { options, setSelectedEnvironmentId, setSelectedProjectKey } =
    useHomeListOptions(availableEnvironmentIds);
  const scopes = buildHomeProjectScopes({
    projects,
    environmentId: options.selectedEnvironmentId,
    projectGroupingMode: options.projectGroupingMode,
  });
  const projectOptions = pickableProjectGroups(
    sortHomeProjectScopes({
      scopes,
      threads: [],
      pendingTasks: [],
      projectSortOrder: "updated_at",
    }),
  );
  const selectedProjectKey = resolveHomeProjectFilterScope(scopes, projects, options)?.key ?? null;
  const environmentFiltered = options.selectedEnvironmentId !== null;
  const projectFiltered = selectedProjectKey !== null;

  return [
    <Toolbar.Menu
      key="fork-environment-filter"
      title="Environment"
      accessibilityLabel="Filter by environment"
      icon={environmentFiltered ? "desktopcomputer.and.macbook" : "desktopcomputer"}
    >
      <Toolbar.MenuAction
        isOn={!environmentFiltered}
        onPress={() => setSelectedEnvironmentId(null)}
      >
        All environments
      </Toolbar.MenuAction>
      {environments.map((environment) => (
        <Toolbar.MenuAction
          key={environment.environmentId}
          isOn={options.selectedEnvironmentId === environment.environmentId}
          onPress={() => setSelectedEnvironmentId(environment.environmentId)}
        >
          {environment.label}
        </Toolbar.MenuAction>
      ))}
    </Toolbar.Menu>,
    <Toolbar.Menu
      key="fork-project-filter"
      title="Project"
      accessibilityLabel="Filter by project"
      icon={projectFiltered ? "folder.fill" : "folder"}
    >
      <Toolbar.MenuAction isOn={!projectFiltered} onPress={() => setSelectedProjectKey(null)}>
        All projects
      </Toolbar.MenuAction>
      {projectOptions.map((project) => (
        <Toolbar.MenuAction
          key={project.key}
          isOn={selectedProjectKey === project.key}
          onPress={() => setSelectedProjectKey(project.key)}
        >
          {project.title}
        </Toolbar.MenuAction>
      ))}
    </Toolbar.Menu>,
  ];
}
