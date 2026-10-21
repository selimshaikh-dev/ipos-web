import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WorkspaceOptionsService } from '../../core/workspace/services/workspace-options.service';
import { WorkspaceContextService } from '../../core/workspace/services/workspace-context.service';
import type { WorkspaceCompanyOption } from '../../core/workspace/models/workspace-options.model';

@Component({
  selector: 'app-platform-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="platform-page">
      <div class="platform-heading">
        <div>
          <div class="eyebrow">SYSTEM ADMINISTRATION</div>
          <h1>Platform Dashboard</h1>
          <p>Manage organizations and enter an authorized company workspace when needed.</p>
        </div>
        <a class="primary-link" routerLink="/settings/organization/company-management">
          Company Management
        </a>
      </div>
      @if (loading()) {
        <p role="status">Loading authorized organizations…</p>
      } @else if (failed()) {
        <div class="notice" role="alert">
          Unable to load company options.
          <button type="button" (click)="load()">Retry</button>
        </div>
      } @else {
        <div class="stat-grid">
          <div class="stat"><span>Authorized companies</span><strong>{{ companies().length }}</strong></div>
          <div class="stat"><span>Authorized branches</span><strong>{{ branchCount() }}</strong></div>
        </div>
        <h2>Company workspaces</h2>
        <p class="helper">Selecting a company changes your working context; it does not grant permissions.</p>
        <div class="company-grid">
          @for (company of companies(); track company.id) {
            <button class="company-card" type="button" (click)="enterCompany(company.id)">
              <span class="company-symbol material-symbols-rounded" aria-hidden="true">domain</span>
              <span class="company-info"><strong>{{ company.name }}</strong>
                <small>{{ company.code }} · {{ company.branches.length }} branches</small>
              </span>
              <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
            </button>
          } @empty {
            <p>No authorized company workspaces are available.</p>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    :host{display:block}.platform-page{max-width:1150px;margin:0 auto;padding:10px 0 32px;color:var(--ipos-text-primary,#1f2937)}
    .platform-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:28px}
    .eyebrow{font-size:11px;font-weight:700;letter-spacing:1px;color:#64748b}
    h1{font-size:27px;margin:7px 0}h2{font-size:18px;margin:30px 0 6px}
    p{color:#64748b;font-size:14px;line-height:1.6}.primary-link{display:inline-flex;padding:12px 17px;border-radius:9px;background:#2563eb;color:white;text-decoration:none;font-weight:600;font-size:13px}
    .stat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
    .stat{background:white;border:1px solid #e2e8f0;border-radius:13px;padding:22px;display:flex;flex-direction:column;gap:12px}
    .stat span{font-size:13px;color:#64748b}.stat strong{font-size:30px}.helper{margin:0 0 16px}
    .company-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
    .company-card{display:flex;align-items:center;gap:13px;text-align:left;border:1px solid #e2e8f0;border-radius:12px;background:white;padding:17px;cursor:pointer;color:inherit}
    .company-card:hover,.company-card:focus-visible{border-color:#2563eb;box-shadow:0 4px 14px #2563eb16}
    .company-symbol{color:#2563eb;background:#eff6ff;padding:11px;border-radius:10px}
    .company-info{display:flex;flex:1;min-width:0;flex-direction:column;gap:4px}.company-info strong{font-size:14px}.company-info small{font-size:12px;color:#64748b}
    .notice{padding:20px;background:white;border:1px solid #fecaca;border-radius:10px}
    .notice button{margin-left:12px;cursor:pointer}
    @media(max-width:600px){.stat-grid{grid-template-columns:1fr}.platform-heading{align-items:flex-start}}
  `]
})
export class PlatformDashboard {
  private readonly api = inject(WorkspaceOptionsService);
  private readonly workspace = inject(WorkspaceContextService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly companies = signal<readonly WorkspaceCompanyOption[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly branchCount = () => this.companies().reduce(
    (sum, company) => sum + company.branches.length, 0
  );

  constructor() { this.load(); }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.getOptions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => {
        this.companies.set(response.companies ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      }
    });
  }

  enterCompany(companyId: number): void {
    const company = this.companies().find(item => item.id === companyId);
    if (!company) return;
    this.workspace.configureCompany(company);
    void this.router.navigateByUrl('/dashboard');
  }
}