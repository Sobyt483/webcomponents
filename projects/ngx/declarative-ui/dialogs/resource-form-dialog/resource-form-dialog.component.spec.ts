import { FormFieldDefinition } from '../../form/models';
import { ResourceFormConfig } from '../../table-card';
import { ResourceFormDialog } from './resource-form-dialog.component';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { axe } from 'vitest-axe';

describe('ResourceFormDialog', () => {
  let fixture: ComponentFixture<ResourceFormDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResourceFormDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(ResourceFormDialog);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('config', {
      fields: [{ name: 'metadata.name', label: 'Name' }],
      title: 'Create resource',
    });
    fixture.componentRef.setInput('fields', [
      { name: 'metadata.name', label: 'Name' },
    ]);
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('has no automatically-detectable accessibility violations', async () => {
    expect(await axe(fixture.nativeElement)).toHaveNoViolations();
  });

  // ---------------------------------------------------------------------------
  // onFieldChange hook — owned by the dialog
  // ---------------------------------------------------------------------------

  describe('onFieldChange hook', () => {
    const FIELDS: FormFieldDefinition[] = [
      { name: 'metadata.name', label: 'Name' },
      { name: 'metadata.namespace', label: 'Namespace' },
    ];
    const UPDATED: FormFieldDefinition[] = [
      { name: 'metadata.name', label: 'Name' },
      { name: 'metadata.namespace', label: 'Namespace', values: ['staging'] },
    ];
    const fieldChange = {
      fieldProperty: 'metadata.namespace',
      value: 'staging',
    };

    /** Freshly built dialog where the test owns `fields` and `config`. */
    function makeDialog(config: ResourceFormConfig) {
      const f = TestBed.createComponent(ResourceFormDialog);
      f.componentRef.setInput('open', true);
      f.componentRef.setInput('fields', FIELDS);
      f.componentRef.setInput('config', config);
      f.detectChanges();
      return f;
    }

    it('emits fieldChange BEFORE awaiting the hook (output contract preserved)', async () => {
      let hookSettled = false;
      const onFieldChange = vi.fn().mockImplementation(() => {
        return Promise.resolve().then(() => {
          hookSettled = true;
          return undefined;
        });
      });
      const f = makeDialog({ fields: FIELDS, onFieldChange });

      const emitted: unknown[] = [];
      let emittedBeforeAwait = false;
      f.componentInstance.fieldChange.subscribe((e) => {
        emitted.push(e);
        if (!hookSettled) emittedBeforeAwait = true;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange(fieldChange);

      expect(emitted).toEqual([fieldChange]);
      expect(emittedBeforeAwait).toBe(true);
    });

    it('emits fieldsUpdated with the hook result (fields + initialValues)', async () => {
      const onFieldChange = vi.fn().mockResolvedValue({
        fields: UPDATED,
        initialValues: { 'metadata.namespace': '' },
      });
      const f = makeDialog({ fields: FIELDS, onFieldChange });

      const updates: {
        fields: FormFieldDefinition[];
        initialValues?: Record<string, unknown>;
      }[] = [];
      f.componentInstance.fieldsUpdated.subscribe((p) => updates.push(p));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange(fieldChange);

      expect(updates).toEqual([
        { fields: UPDATED, initialValues: { 'metadata.namespace': '' } },
      ]);
    });

    it('passes the raw input fields to the hook (no override indirection)', async () => {
      const onFieldChange = vi.fn().mockResolvedValue(undefined);
      const f = makeDialog({ fields: FIELDS, onFieldChange });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange({
        fieldProperty: 'a',
        value: '1',
      });

      expect(onFieldChange).toHaveBeenCalledWith(
        { fieldProperty: 'a', value: '1' },
        FIELDS,
      );
    });

    it('does not emit fieldsUpdated when the hook returns undefined', async () => {
      const onFieldChange = vi.fn().mockResolvedValue(undefined);
      const f = makeDialog({ fields: FIELDS, onFieldChange });

      const updates: unknown[] = [];
      f.componentInstance.fieldsUpdated.subscribe((p) => updates.push(p));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange(fieldChange);

      expect(updates).toEqual([]);
    });

    it('emits fieldsUpdated with initialValues=undefined when result omits them', async () => {
      const onFieldChange = vi.fn().mockResolvedValue({ fields: UPDATED });
      const f = makeDialog({ fields: FIELDS, onFieldChange });

      const updates: {
        fields: FormFieldDefinition[];
        initialValues?: Record<string, unknown>;
      }[] = [];
      f.componentInstance.fieldsUpdated.subscribe((p) => updates.push(p));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange(fieldChange);

      expect(updates).toEqual([
        { fields: UPDATED, initialValues: undefined },
      ]);
    });

    it('still emits fieldChange when onFieldChange is absent', async () => {
      const f = makeDialog({ fields: FIELDS });
      const emitted: unknown[] = [];
      f.componentInstance.fieldChange.subscribe((e) => emitted.push(e));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange(fieldChange);

      expect(emitted).toEqual([fieldChange]);
    });

    it('last-write-wins: stale resolver result is dropped and does not emit fieldsUpdated', async () => {
      let resolveFirst!: (
        v: {
          fields: FormFieldDefinition[];
          initialValues?: Record<string, unknown>;
        },
      ) => void;
      let resolveSecond!: (
        v: {
          fields: FormFieldDefinition[];
          initialValues?: Record<string, unknown>;
        },
      ) => void;

      let callCount = 0;
      const onFieldChange = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return new Promise((r) => {
            resolveFirst = r;
          });
        }
        return new Promise((r) => {
          resolveSecond = r;
        });
      });

      const f = makeDialog({ fields: FIELDS, onFieldChange });

      const FIRST: FormFieldDefinition[] = [{ name: 'first', label: 'First' }];
      const SECOND: FormFieldDefinition[] = [
        { name: 'second', label: 'Second' },
      ];

      const updates: {
        fields: FormFieldDefinition[];
        initialValues?: Record<string, unknown>;
      }[] = [];
      f.componentInstance.fieldsUpdated.subscribe((p) => updates.push(p));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p1 = (f.componentInstance as any).handleFieldChange({
        fieldProperty: 'metadata.namespace',
        value: 'first',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p2 = (f.componentInstance as any).handleFieldChange({
        fieldProperty: 'metadata.namespace',
        value: 'second',
      });

      // Fast (second) resolves first → fieldsUpdated emits SECOND.
      resolveSecond({ fields: SECOND });
      await p2;
      expect(updates).toEqual([
        { fields: SECOND, initialValues: undefined },
      ]);

      // Slow (first/stale) resolves after — must be dropped silently.
      resolveFirst({ fields: FIRST });
      await p1;
      expect(updates).toEqual([
        { fields: SECOND, initialValues: undefined },
      ]);
    });

    // -------------------------------------------------------------------------
    // source filtering — seed echoes must not trigger the hook
    // -------------------------------------------------------------------------

    it('does NOT call onFieldChange when the event has source: "seed"', async () => {
      const onFieldChange = vi.fn().mockResolvedValue(undefined);
      const f = makeDialog({ fields: FIELDS, onFieldChange });

      const emitted: unknown[] = [];
      f.componentInstance.fieldChange.subscribe((e) => emitted.push(e));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange({
        ...fieldChange,
        source: 'seed',
      });

      // Public output still fires (contract preserved).
      expect(emitted).toEqual([{ ...fieldChange, source: 'seed' }]);
      // But the hook was NOT called — seed echoes must not clear dependents.
      expect(onFieldChange).not.toHaveBeenCalled();
    });

    it('calls onFieldChange when the event has source: "user"', async () => {
      const onFieldChange = vi.fn().mockResolvedValue(undefined);
      const f = makeDialog({ fields: FIELDS, onFieldChange });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange({
        ...fieldChange,
        source: 'user',
      });

      expect(onFieldChange).toHaveBeenCalledTimes(1);
    });

    it('calls onFieldChange when source is absent (back-compat: undefined treated as user)', async () => {
      const onFieldChange = vi.fn().mockResolvedValue(undefined);
      const f = makeDialog({ fields: FIELDS, onFieldChange });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange(fieldChange);

      expect(onFieldChange).toHaveBeenCalledTimes(1);
    });

    it('public fieldChange output fires for seed events too (contract preserved)', async () => {
      const f = makeDialog({ fields: FIELDS });

      const emitted: unknown[] = [];
      f.componentInstance.fieldChange.subscribe((e) => emitted.push(e));

      const seedEvent = { ...fieldChange, source: 'seed' as const };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange(seedEvent);

      expect(emitted).toEqual([seedEvent]);
    });

    it('clears the race guard on open false → true (fresh session)', async () => {
      let resolveFirst!: (
        v: {
          fields: FormFieldDefinition[];
          initialValues?: Record<string, unknown>;
        },
      ) => void;
      let resolveSecond!: (
        v: {
          fields: FormFieldDefinition[];
          initialValues?: Record<string, unknown>;
        },
      ) => void;
      let callCount = 0;
      const onFieldChange = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return new Promise((r) => {
            resolveFirst = r;
          });
        }
        return new Promise((r) => {
          resolveSecond = r;
        });
      });

      const f = TestBed.createComponent(ResourceFormDialog);
      f.componentRef.setInput('open', true);
      f.componentRef.setInput('fields', FIELDS);
      f.componentRef.setInput('config', { fields: FIELDS, onFieldChange });
      f.detectChanges();

      const updates: unknown[] = [];
      f.componentInstance.fieldsUpdated.subscribe((p) => updates.push(p));

      // Start a resolver under the first session.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p1 = (f.componentInstance as any).handleFieldChange({
        fieldProperty: 'metadata.namespace',
        value: 'session-1',
      });

      // Close and re-open — the race guard must clear so a NEW event for the
      // SAME key under the new session wins even if the first resolver
      // settles later.
      f.componentRef.setInput('open', false);
      f.detectChanges();
      f.componentRef.setInput('open', true);
      f.detectChanges();

      // Second event, now under the fresh session.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p2 = (f.componentInstance as any).handleFieldChange({
        fieldProperty: 'metadata.namespace',
        value: 'session-2',
      });

      // First resolver settles AFTER the re-open. Without the guard clear,
      // it would still look "current" (same key, same value never recorded
      // in session 2 yet). With the guard clear, session 2's acquire replaces
      // it anyway. Either way we verify the second update lands correctly.
      resolveSecond({ fields: FIELDS });
      await p2;
      resolveFirst({ fields: FIELDS });
      await p1;

      // Session 2's update is present.
      expect(
        updates.some(
          (u) =>
            (u as { fields: FormFieldDefinition[] }).fields === FIELDS,
        ),
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // patchForm — delegate to inner form
  // ---------------------------------------------------------------------------

  describe('patchForm delegate', () => {
    it('delegates patchForm(values) to the inner form with the same args', async () => {
      const f = TestBed.createComponent(ResourceFormDialog);
      f.componentRef.setInput('open', true);
      f.componentRef.setInput('fields', [
        { name: 'metadata.name', label: 'Name' },
      ]);
      f.detectChanges();

      // The inner form is the first child DeclarativeForm — spy on its
      // patchForm so we can verify args are forwarded verbatim.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const innerForm = (f.componentInstance as any).form();
      const spy = vi.spyOn(innerForm, 'patchForm');

      const values = { 'metadata.name': 'from-dialog' };
      f.componentInstance.patchForm(values);

      // Delegate is scheduled via afterNextRender — flush with CD + whenStable.
      f.detectChanges();
      await f.whenStable();

      expect(spy).toHaveBeenCalledWith(values, undefined);
    });

    it('forwards options.emitEvent:false to the inner form', async () => {
      const f = TestBed.createComponent(ResourceFormDialog);
      f.componentRef.setInput('open', true);
      f.componentRef.setInput('fields', [
        { name: 'metadata.name', label: 'Name', validation: 'onChange' },
      ]);
      f.detectChanges();

      const emitted: unknown[] = [];
      f.componentInstance.fieldChange.subscribe((e) => emitted.push(e));

      f.componentInstance.patchForm(
        { 'metadata.name': 'silent' },
        { emitEvent: false },
      );
      f.detectChanges();
      await f.whenStable();

      // Silent — no fieldChange from the delegate.
      expect(emitted).toEqual([]);
    });

    it('emits fieldChange when patchForm is called without options', async () => {
      const f = TestBed.createComponent(ResourceFormDialog);
      f.componentRef.setInput('open', true);
      f.componentRef.setInput('fields', [
        { name: 'metadata.name', label: 'Name', validation: 'onChange' },
      ]);
      f.detectChanges();

      const emitted: unknown[] = [];
      f.componentInstance.fieldChange.subscribe((e) => emitted.push(e));

      f.componentInstance.patchForm({ 'metadata.name': 'loud' });
      f.detectChanges();
      await f.whenStable();

      // Default is emit — the delegate must NOT suppress.
      expect(emitted).toEqual([
        { fieldProperty: 'metadata.name', value: 'loud', source: 'seed' },
      ]);
    });

    it('silently patches when emitEvent: false (no fieldChange emits)', async () => {
      // Silent-seed primitive — hosts call this on edit-open so prefilled
      // values do not echo as `fieldChange` events.
      const f = TestBed.createComponent(ResourceFormDialog);
      f.componentRef.setInput('open', true);
      f.componentRef.setInput('fields', [
        { name: 'metadata.name', label: 'Name', validation: 'onChange' },
      ]);
      f.detectChanges();

      const emitted: unknown[] = [];
      f.componentInstance.fieldChange.subscribe((e) => emitted.push(e));

      f.componentInstance.patchForm(
        { 'metadata.name': 'from-seed' },
        { emitEvent: false },
      );
      f.detectChanges();
      await f.whenStable();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const innerForm = (f.componentInstance as any).form();
      expect(innerForm.form.controls['metadata.name']?.value).toBe('from-seed');
      expect(emitted).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // reset-on-close — discard lingering user-typed state so the next open starts clean
  // ---------------------------------------------------------------------------

  describe('reset-on-close', () => {
    it('resets the inner form when `open` transitions true → false', async () => {
      const f = TestBed.createComponent(ResourceFormDialog);
      f.componentRef.setInput('open', true);
      f.componentRef.setInput('fields', [
        { name: 'metadata.name', label: 'Name' },
      ]);
      f.detectChanges();

      // Patch a value as if the user had typed it.
      f.componentInstance.patchForm(
        { 'metadata.name': 'user-typed' },
        { emitEvent: false },
      );
      f.detectChanges();
      await f.whenStable();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const innerForm = (f.componentInstance as any).form();
      expect(innerForm.form.controls['metadata.name']?.value).toBe('user-typed');

      // Close the dialog.
      f.componentRef.setInput('open', false);
      f.detectChanges();
      await f.whenStable();

      // Controls are back to empty — the next open starts clean.
      expect(innerForm.form.controls['metadata.name']?.value).toBeNull();
    });

    it('does not reset on open false → true', async () => {
      const f = TestBed.createComponent(ResourceFormDialog);
      f.componentRef.setInput('open', false);
      f.componentRef.setInput('fields', [
        { name: 'metadata.name', label: 'Name' },
      ]);
      f.detectChanges();

      f.componentRef.setInput('open', true);
      f.detectChanges();

      // Seed after open.
      f.componentInstance.patchForm(
        { 'metadata.name': 'kept' },
        { emitEvent: false },
      );
      f.detectChanges();
      await f.whenStable();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const innerForm = (f.componentInstance as any).form();
      expect(innerForm.form.controls['metadata.name']?.value).toBe('kept');
    });
  });
});
