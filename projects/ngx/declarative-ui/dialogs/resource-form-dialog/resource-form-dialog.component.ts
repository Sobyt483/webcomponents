import { DeclarativeForm } from '../../form';
import {
  FormFieldChangeEvent,
  FormFieldDefinition,
  FormFieldErrors,
} from '../../form/models';
import { GenericResource } from '../../models';
import { SanitizeHtmlPipe } from '../../pipes/sanitize-html.pipe';
import { ResourceFormConfig } from '../../table-card';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  Injector,
  ViewEncapsulation,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
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
  readonly fieldsUpdated = output<{
    fields: FormFieldDefinition[];
    initialValues?: Record<string, unknown>;
  }>();
  readonly submitted = output<Record<string, unknown>>();
  readonly cancelled = output<void>();

  private readonly latestValues = new Map<string, unknown>();

  private readonly injector = inject(Injector);

  private readonly form = viewChild<DeclarativeForm<GenericResource>>('form');

  protected hasErrors = computed(() => {
    const errors = this.fieldErrors();
    return !!errors && Object.values(errors).some((val) => !!val);
  });

  constructor() {
    let prevOpen = this.open();
    // On every `open` toggle, invalidate the race-guard map so in-flight
    // resolvers from the previous session cannot land on the new one. On
    // close transitions, additionally reset the inner form so a reopen
    // starts with empty controls
    effect(() => {
      const currentOpen = this.open();
      this.latestValues.clear();
      if (prevOpen && !currentOpen) {
        this.form()?.form.reset({}, { emitEvent: false });
      }
      prevOpen = currentOpen;
    });
  }

  protected async handleFieldChange(
    event: FormFieldChangeEvent,
  ): Promise<void> {
    this.fieldChange.emit(event);

    if (event.source === 'seed') return;

    const onFieldChange = this.config()?.onFieldChange;
    if (!onFieldChange) return;

    const stillCurrent = this.acquireLatestValue(
      event.fieldProperty,
      event.value,
    );
    const result = await onFieldChange(event, this.fields());

    if (!stillCurrent()) return;
    if (result === undefined) return;

    this.fieldsUpdated.emit({
      fields: result.fields,
      initialValues: result.initialValues,
    });
  }

  private acquireLatestValue(key: string, value: unknown): () => boolean {
    this.latestValues.set(key, value);
    return () => this.latestValues.get(key) === value;
  }

  /**
   * Delegates to {@link DeclarativeForm.patchForm}. Scheduled via
   * `afterNextRender` so hosts can call this synchronously right after
   * flipping `open: true` or pushing a new `fields` identity — the actual
   * write runs after Angular's next CD cycle, by which point the inner
   * form's `rebuildControls` effect has created the FormGroup entries for
   * the current fields and `form.patchValue` can land. The silent-seed
   * path is `patchForm(values, { emitEvent: false })` — matches Angular's
   * own `setValue(v, { emitEvent: false })` convention.
   */
  patchForm(
    values: Partial<Record<string, unknown>>,
    options?: { emitEvent?: boolean },
  ): void {
    afterNextRender(
      () => {
        this.form()?.patchForm(values as Record<string, unknown>, options);
      },
      { injector: this.injector },
    );
  }
}
