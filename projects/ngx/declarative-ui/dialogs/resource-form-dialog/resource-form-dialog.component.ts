import { DeclarativeForm } from '../../form';
import {
  FormFieldChangeEvent,
  FormFieldDefinition,
  FormFieldErrors,
} from '../../form/models';
import { SanitizeHtmlPipe } from '../../pipes/sanitize-html.pipe';
import { ResourceFormConfig } from '../../table-card';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { Button } from '@fundamental-ngx/ui5-webcomponents/button';
import { Dialog } from '@fundamental-ngx/ui5-webcomponents/dialog';
import { Title } from '@fundamental-ngx/ui5-webcomponents/title';

@Component({
  selector: 'mfp-resource-form-dialog',
  imports: [Dialog, Title, Button, DeclarativeForm, SanitizeHtmlPipe],
  templateUrl: './resource-form-dialog.component.html',
  styleUrl: './resource-form-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ResourceFormDialog {
  readonly open = input(false);
  readonly config = input<ResourceFormConfig | undefined>(undefined);
  readonly fields = input<FormFieldDefinition[]>([]);
  readonly fieldErrors = input<FormFieldErrors>({});
  readonly initialValues = input<Record<string, unknown>>({});
  readonly defaultTitle = input('Create');
  readonly defaultConfirmLabel = input('Save');
  readonly defaultCancelLabel = input('Cancel');
  readonly dataTestidPrefix = input('generic-table-card-create');

  readonly fieldChange = output<FormFieldChangeEvent>();
  readonly submitted = output<Record<string, unknown>>();
  readonly cancelled = output<void>();

  /**
   * Per-field last-emitted value, used as a last-write-wins race guard around
   * the async `onFieldChange` hook: if the same field is edited twice in
   * quick succession, a slower resolver's result is dropped. Strict `!==`
   * comparison is correct for falsy values (0 / false / ''). Note the
   * intentional ABA caveat: a value flipped A→B→A while a resolver is in
   * flight looks "still current" to the first A's handler — harmless here
   * because the resolver is a pure function of the event value, so the same
   * input yields the same options.
   *
   * Cleared on each new session (open false→true, or config identity change)
   * so stale resolvers from the previous session cannot land on the new one.
   */
  private readonly latestValues = new Map<string, unknown>();

  /** Overrides applied by the `onFieldChange` hook; `null` means no override yet. */
  protected readonly appliedFields = signal<FormFieldDefinition[] | null>(null);
  protected readonly appliedInitialValues = signal<Record<
    string,
    unknown
  > | null>(null);

  /** Fields rendered inside the dialog — override wins over the raw input. */
  protected readonly effectiveFields = computed(
    () => this.appliedFields() ?? this.fields(),
  );
  /** Initial values pushed into the inner form — override wins over the raw input. */
  protected readonly effectiveInitialValues = computed(
    () => this.appliedInitialValues() ?? this.initialValues(),
  );

  protected hasErrors = computed(() => {
    const errors = this.fieldErrors();
    return !!errors && Object.values(errors).some((val) => !!val);
  });

  constructor() {
    // Reset overrides on each fresh dialog session. Two triggers:
    //  1. `open` goes false → true (user re-opens the dialog).
    //  2. `config` identity changes (host swaps which resource is being edited
    //     without closing the dialog) — otherwise an override applied for
    //     resource A would linger into resource B's view.
    let prevOpen = this.open();
    let prevConfig = this.config();
    effect(() => {
      const currentOpen = this.open();
      const currentConfig = this.config();
      const openedNow = !prevOpen && currentOpen;
      const configSwapped = currentConfig !== prevConfig;
      if (openedNow || configSwapped) {
        this.appliedFields.set(null);
        this.appliedInitialValues.set(null);
        // Invalidate any in-flight resolver started under the previous session
        // so its result is dropped when it settles.
        this.latestValues.clear();
      }
      prevOpen = currentOpen;
      prevConfig = currentConfig;
    });
  }

  /**
   * Called when the inner form reports a field change. Re-emits the event for
   * host observers (preserving the output contract), then runs the config's
   * `onFieldChange` hook (if any), with a last-write-wins guard so stale
   * resolver results are dropped.
   */
  protected async handleFieldChange(
    event: FormFieldChangeEvent,
  ): Promise<void> {
    // Emit FIRST, synchronously, before any await — hosts rely on this to run
    // validation or logging as soon as the change arrives.
    this.fieldChange.emit(event);

    const onFieldChange = this.config()?.onFieldChange;
    if (!onFieldChange) return;

    const stillCurrent = this.acquireLatestValue(
      event.fieldProperty,
      event.value,
    );
    // Pass the currently-applied fields (not the raw input) so the hook sees
    // the dialog's view of the world.
    const result = await onFieldChange(event, this.effectiveFields());

    if (!stillCurrent()) return;
    if (result === undefined) return;

    this.appliedFields.set(result.fields);
    if (result.initialValues !== undefined) {
      this.appliedInitialValues.set(result.initialValues);
    }
  }

  /**
   * Records `(key, value)` as the latest-known value for a field, and returns
   * a closure that reports whether that record is still the latest — i.e.
   * whether this acquire has NOT been superseded by a later one for the same
   * key. Used across the `onFieldChange` await to drop stale results.
   */
  private acquireLatestValue(key: string, value: unknown): () => boolean {
    this.latestValues.set(key, value);
    return () => this.latestValues.get(key) === value;
  }
}
