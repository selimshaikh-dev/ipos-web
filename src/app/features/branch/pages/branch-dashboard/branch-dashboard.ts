import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WorkspaceContextService } from '../../../../core/workspace/services/workspace-context.service';

/**
 * Branch workspace landing page.
 * Operational KPIs are intentionally not fabricated while APIs are unimplemented.
 * The shared AppShell is responsible for selecting an authorized branch.
 */
@Component({
  selector: 'app-branch-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="branch-dashboard">
      <header class="branch-dashboard-header">
        <div>
          <span class="branch-eyebrow">BRANCH WORKSPACE</span>
          <h1>Branch Dashboard</h1>
          <p>Daily operations for {{ workspace.branchDisplayName() }}.</p>
        </div>
      </header>
      <div class="branch-dashboard-panel">
        <div class="branch-panel-icon" aria-hidden="true">
          <span class="material-symbols-rounded">store</span>
        </div>
        <div>
          <h2>{{ workspace.branchDisplayName() }}</h2>
          <p>{{ workspace.companyDisplayName() }}</p>
          <p class="branch-dashboard-note">
            Use the navigation to explore planned branch operations.
            Live branch KPIs will appear when their services are available.
          </p>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .branch-dashboard { max-width: var(--ipos-content-max-width, 1520px); margin: 0 auto; color: var(--ipos-text, #101828); }
    .branch-dashboard-header { margin-bottom: 24px; }
    .branch-eyebrow { color: var(--ipos-primary, #2563eb); font-size: 11px; font-weight: 700; letter-spacing: .09em; }
    h1 { margin: 8px 0; font-size: clamp(24px, 3vw, 30px); font-weight: 700; }
    .branch-dashboard-header p, .branch-dashboard-panel p { color: var(--ipos-text-muted, #667085); margin: 6px 0; }
    .branch-dashboard-panel { display: flex; align-items: flex-start; gap: 18px; padding: 26px; background: var(--ipos-surface, #fff); border: 1px solid var(--ipos-border, #e4e7ec); border-radius: var(--ipos-radius-lg, 14px); box-shadow: var(--ipos-shadow-sm, 0 1px 3px #1018280d); }
    .branch-panel-icon { display: grid; place-items: center; flex: 0 0 48px; height: 48px; color: var(--ipos-primary, #2563eb); background: var(--ipos-primary-soft, #eff6ff); border-radius: 12px; }
    .branch-dashboard-panel h2 { margin: 0 0 6px; font-size: 18px; }
    .branch-dashboard-note { margin-top: 16px !important; line-height: 1.6; }
    @media (max-width: 575px) { .branch-dashboard-panel { padding: 18px; } }
  `]
})
export class BranchDashboard {
  readonly workspace = inject(WorkspaceContextService);
}