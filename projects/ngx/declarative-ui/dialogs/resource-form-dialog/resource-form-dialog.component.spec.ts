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

    it('applies returned fields and initialValues from the hook', async () => {
      const onFieldChange = vi.fn().mockResolvedValue({
        fields: UPDATED,
        initialValues: { 'metadata.namespace': '' },
      });
      const f = makeDialog({ fields: FIELDS, onFieldChange });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange(fieldChange);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((f.componentInstance as any).effectiveFields()).toEqual(UPDATED);
      expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (f.componentInstance as any).effectiveInitialValues(),
      ).toEqual({ 'metadata.namespace': '' });
    });

    it('passes the currently-applied fields to the hook (not the raw input)', async () => {
      const FIRST: FormFieldDefinition[] = [
        { name: 'a', label: 'A', values: ['x'] },
      ];
      const SECOND: FormFieldDefinition[] = [
        { name: 'a', label: 'A', values: ['y'] },
      ];
      const onFieldChange = vi
        .fn()
        .mockResolvedValueOnce({ fields: FIRST })
        .mockResolvedValueOnce({ fields: SECOND });

      const f = makeDialog({ fields: FIELDS, onFieldChange });

      // First invocation sees the raw input fields.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange({
        fieldProperty: 'a',
        value: '1',
      });
      expect(onFieldChange).toHaveBeenNthCalledWith(
        1,
        { fieldProperty: 'a', value: '1' },
        FIELDS,
      );

      // Second invocation must see the override from the first.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange({
        fieldProperty: 'a',
        value: '2',
      });
      expect(onFieldChange).toHaveBeenNthCalledWith(
        2,
        { fieldProperty: 'a', value: '2' },
        FIRST,
      );
    });

    it('does nothing when the hook returns undefined', async () => {
      const onFieldChange = vi.fn().mockResolvedValue(undefined);
      const f = makeDialog({ fields: FIELDS, onFieldChange });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange(fieldChange);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((f.componentInstance as any).effectiveFields()).toEqual(FIELDS);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((f.componentInstance as any).effectiveInitialValues()).toEqual({});
    });

    it('leaves initialValues untouched when result omits them', async () => {
      const onFieldChange = vi
        .fn()
        .mockResolvedValue({ fields: UPDATED });
      const f = makeDialog({ fields: FIELDS, onFieldChange });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange(fieldChange);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((f.componentInstance as any).effectiveFields()).toEqual(UPDATED);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((f.componentInstance as any).effectiveInitialValues()).toEqual({});
    });

    it('still emits fieldChange when onFieldChange is absent', async () => {
      const f = makeDialog({ fields: FIELDS });
      const emitted: unknown[] = [];
      f.componentInstance.fieldChange.subscribe((e) => emitted.push(e));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange(fieldChange);

      expect(emitted).toEqual([fieldChange]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((f.componentInstance as any).effectiveFields()).toEqual(FIELDS);
    });

    it('last-write-wins: stale resolver does not clobber a fresher result', async () => {
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

      // Fast (second) resolves first.
      resolveSecond({ fields: SECOND });
      await p2;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((f.componentInstance as any).effectiveFields()).toEqual(SECOND);

      // Slow (first/stale) must be dropped.
      resolveFirst({ fields: FIRST });
      await p1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((f.componentInstance as any).effectiveFields()).toEqual(SECOND);
    });

    it('resets overrides on open false → true transition', async () => {
      const onFieldChange = vi
        .fn()
        .mockResolvedValue({ fields: UPDATED });
      const f = TestBed.createComponent(ResourceFormDialog);
      f.componentRef.setInput('open', true);
      f.componentRef.setInput('fields', FIELDS);
      f.componentRef.setInput('config', { fields: FIELDS, onFieldChange });
      f.detectChanges();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange(fieldChange);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((f.componentInstance as any).effectiveFields()).toEqual(UPDATED);

      // Close.
      f.componentRef.setInput('open', false);
      f.detectChanges();
      // Re-open — overrides should reset so the raw input wins again.
      f.componentRef.setInput('open', true);
      f.detectChanges();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((f.componentInstance as any).effectiveFields()).toEqual(FIELDS);
    });

    it('resets overrides when the config identity changes', async () => {
      const onFieldChange = vi
        .fn()
        .mockResolvedValue({ fields: UPDATED });
      const config: ResourceFormConfig = { fields: FIELDS, onFieldChange };
      const f = TestBed.createComponent(ResourceFormDialog);
      f.componentRef.setInput('open', true);
      f.componentRef.setInput('fields', FIELDS);
      f.componentRef.setInput('config', config);
      f.detectChanges();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (f.componentInstance as any).handleFieldChange(fieldChange);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((f.componentInstance as any).effectiveFields()).toEqual(UPDATED);

      // Host swaps to a different config (e.g. different pending resource).
      const otherConfig: ResourceFormConfig = {
        fields: FIELDS,
        onFieldChange,
      };
      f.componentRef.setInput('config', otherConfig);
      f.detectChanges();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((f.componentInstance as any).effectiveFields()).toEqual(FIELDS);
    });
  });
});
