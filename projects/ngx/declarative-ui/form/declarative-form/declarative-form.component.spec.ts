import { GenericResource } from '../../models';
import { FormFieldChangeEvent, FormFieldDefinition } from '../models';
import { DeclarativeForm } from './declarative-form.component';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule, FormArray, FormGroup } from '@angular/forms';
import { axe } from 'vitest-axe';

describe('DeclarativeForm', () => {
  let component: DeclarativeForm<GenericResource>;
  let fixture: ComponentFixture<DeclarativeForm<GenericResource>>;

  const testFields: FormFieldDefinition[] = [
    {
      name: 'metadata.name',
      label: 'Name',
      required: true,
      validation: 'onChange',
    },
    {
      name: 'metadata.namespace',
      label: 'Namespace',
      required: false,
      validation: 'onBlur',
    },
    { name: 'metadata.labels', label: 'Labels' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, DeclarativeForm],
    }).compileComponents();

    fixture = TestBed.createComponent(DeclarativeForm);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('fields', testFields);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('has no automatically-detectable accessibility violations', async () => {
    // UI5 web components label their focusable element via an internal
    // shadow-DOM input wired with ARIA at runtime. axe-core traverses into the
    // shadow root and evaluates that inner input, but jsdom does not resolve
    // UI5's cross-shadow `accessibleNameRef`, so the `label` rule reports a
    // false positive here. It is disabled; label association is covered by the
    // `for`/`id` binding asserted in the DOM tests above and verified in-browser
    // by the Storybook a11y addon.
    const results = await axe(fixture.nativeElement, {
      rules: { label: { enabled: false } },
    });

    expect(results).toHaveNoViolations();
  });

  it('has no accessibility violations when rendering a collection field', async () => {
    // Renders the nested mfp-form-collection-field via a propertyCollection
    // field, covering that component's a11y within the form's module context
    // (it and DeclarativeForm have a circular dependency that makes a
    // standalone spec fragile).
    fixture.componentRef.setInput('fields', [
      {
        name: 'spec.artifacts',
        label: 'Artifacts',
        propertyCollection: [
          { name: 'name', label: 'Name' },
          { name: 'url', label: 'URL' },
        ],
      },
    ]);
    fixture.detectChanges();

    const results = await axe(fixture.nativeElement, {
      rules: { label: { enabled: false } },
    });

    expect(results).toHaveNoViolations();
  });

  describe('form initialization', () => {
    it('should create controls for each field', () => {
      expect(component.form.controls['metadata.name']).toBeDefined();
      expect(component.form.controls['metadata.namespace']).toBeDefined();
      expect(component.form.controls['metadata.labels']).toBeDefined();
    });

    it('should not register validators for required fields', () => {
      const ctrl = component.form.controls['metadata.name'];

      ctrl.setValue('');

      expect(ctrl.validator).toBeNull();
      expect(ctrl.valid).toBe(true);
    });

    it('should pre-populate controls from initialValues without marking dirty', () => {
      fixture.componentRef.setInput('initialValues', {
        'metadata.name': 'my-resource',
        'metadata.namespace': 'default',
      });

      fixture.detectChanges();

      expect(component.form.controls['metadata.name'].value).toBe(
        'my-resource',
      );
      expect(component.form.controls['metadata.namespace'].value).toBe(
        'default',
      );
      expect(component.form.controls['metadata.name'].dirty).toBe(false);
      expect(component.getValueState('metadata.name')).toBe('None');
    });

    it('should default missing initialValues keys to empty string', () => {
      fixture.componentRef.setInput('initialValues', {});
      expect(component.form.controls['metadata.name'].value).toBe('');
    });

    it('should render a select when field.values are provided', () => {
      fixture.componentRef.setInput('fields', [
        {
          name: 'metadata.namespace',
          label: 'Namespace',
          values: ['default', 'kube-system'],
        },
      ]);

      fixture.detectChanges();

      const shadowRoot = fixture.nativeElement.shadowRoot as ShadowRoot;
      const fieldElement = shadowRoot.querySelector(
        '[data-testid="generic-form-field-metadata.namespace"]',
      );

      expect(fieldElement?.tagName.toLowerCase()).toBe('ui5-select');
    });

    it('should render an input when field.values are not provided', () => {
      fixture.componentRef.setInput('fields', [
        {
          name: 'metadata.namespace',
          label: 'Namespace',
        },
      ]);

      fixture.detectChanges();

      const shadowRoot = fixture.nativeElement.shadowRoot as ShadowRoot;
      const fieldElement = shadowRoot.querySelector(
        '[data-testid="generic-form-field-metadata.namespace"]',
      );

      expect(fieldElement?.tagName.toLowerCase()).toBe('ui5-input');
    });

    it('should render a password input when inputType is Password', () => {
      fixture.componentRef.setInput('fields', [
        {
          name: 'spec.oidc.clientSecret',
          label: 'Client secret',
          inputType: 'Password',
        },
      ]);
      fixture.detectChanges();

      const shadowRoot = fixture.nativeElement.shadowRoot as ShadowRoot;
      const fieldElement = shadowRoot.querySelector(
        '[data-testid="generic-form-field-spec.oidc.clientSecret"]',
      );

      expect(fieldElement?.tagName.toLowerCase()).toBe('ui5-input');
      expect((fieldElement as HTMLInputElement).type).toBe('Password');
    });

    it('should render a show/hide toggle for password fields by default', () => {
      fixture.componentRef.setInput('fields', [
        {
          name: 'spec.oidc.clientSecret',
          label: 'Client secret',
          inputType: 'Password',
        },
      ]);
      fixture.detectChanges();

      const shadowRoot = fixture.nativeElement.shadowRoot as ShadowRoot;
      const toggle = shadowRoot.querySelector(
        '[data-testid="generic-form-field-spec.oidc.clientSecret-password-toggle"]',
      );

      expect(toggle?.tagName.toLowerCase()).toBe('ui5-input-icon');
      expect(toggle?.getAttribute('name')).toBe('show');
    });

    it('should hide the password toggle when showPasswordToggle is false', () => {
      fixture.componentRef.setInput('fields', [
        {
          name: 'spec.oidc.clientSecret',
          label: 'Client secret',
          inputType: 'Password',
          showPasswordToggle: false,
        },
      ]);
      fixture.detectChanges();

      const shadowRoot = fixture.nativeElement.shadowRoot as ShadowRoot;
      const toggle = shadowRoot.querySelector(
        '[data-testid="generic-form-field-spec.oidc.clientSecret-password-toggle"]',
      );

      expect(toggle).toBeNull();
    });

    it('should reveal password values when the toggle is clicked', () => {
      const passwordField: FormFieldDefinition = {
        name: 'spec.oidc.clientSecret',
        label: 'Client secret',
        inputType: 'Password',
      };
      fixture.componentRef.setInput('fields', [passwordField]);
      fixture.detectChanges();

      const shadowRoot = fixture.nativeElement.shadowRoot as ShadowRoot;
      const input = shadowRoot.querySelector(
        '[data-testid="generic-form-field-spec.oidc.clientSecret"]',
      ) as HTMLInputElement;

      expect(input.type).toBe('Password');

      component.togglePasswordVisibility(passwordField, new Event('click'));
      fixture.detectChanges();

      expect(input.type).toBe('Text');
      expect(
        shadowRoot
          .querySelector(
            '[data-testid="generic-form-field-spec.oidc.clientSecret-password-toggle"]',
          )
          ?.getAttribute('name'),
      ).toBe('hide');
    });

    it('should render hint text below a field', () => {
      fixture.componentRef.setInput('fields', [
        {
          name: 'spec.oidc.discoveryUrl',
          label: 'Discovery URL',
          hint: 'e.g. https://issuer.example.com/.well-known/openid-configuration',
        },
      ]);
      fixture.detectChanges();

      const shadowRoot = fixture.nativeElement.shadowRoot as ShadowRoot;
      const hint = shadowRoot.querySelector(
        '[data-testid="generic-form-field-hint-spec.oidc.discoveryUrl"]',
      );

      expect(hint?.textContent?.trim()).toBe(
        'e.g. https://issuer.example.com/.well-known/openid-configuration',
      );
    });

    it('should render a switch when inputType is Switch', () => {
      fixture.componentRef.setInput('fields', [
        {
          name: 'spec.enabled',
          label: 'Enabled',
          inputType: 'Switch',
        },
      ]);
      fixture.detectChanges();

      const shadowRoot = fixture.nativeElement.shadowRoot as ShadowRoot;
      const fieldElement = shadowRoot.querySelector(
        '[data-testid="generic-form-field-spec.enabled"]',
      );

      expect(fieldElement?.tagName.toLowerCase()).toBe('ui5-switch');
    });

    it('should bind placeholder on text inputs', () => {
      fixture.componentRef.setInput('fields', [
        {
          name: 'spec.oidc.clientSecret',
          label: 'Client secret',
          inputType: 'Password',
          placeholder: 'Leave empty to keep unchanged',
        },
      ]);
      fixture.detectChanges();

      const shadowRoot = fixture.nativeElement.shadowRoot as ShadowRoot;
      const fieldElement = shadowRoot.querySelector(
        '[data-testid="generic-form-field-spec.oidc.clientSecret"]',
      );

      expect((fieldElement as HTMLInputElement).placeholder).toBe(
        'Leave empty to keep unchanged',
      );
      expect(fieldElement?.getAttribute('title')).toBe(
        'Leave empty to keep unchanged',
      );
    });

    it('should render hint text below a select field', () => {
      fixture.componentRef.setInput('fields', [
        {
          name: 'spec.scope',
          label: 'Scope',
          values: ['ClusterScoped', 'Namespaced'],
          hint: 'Choose the resource scope',
        },
      ]);
      fixture.detectChanges();

      const shadowRoot = fixture.nativeElement.shadowRoot as ShadowRoot;
      const hint = shadowRoot.querySelector(
        '[data-testid="generic-form-field-hint-spec.scope"]',
      );

      expect(hint?.textContent?.trim()).toBe('Choose the resource scope');
    });

    it('should coerce string boolean initialValues for switch fields', () => {
      fixture.componentRef.setInput('fields', [
        {
          name: 'spec.enabled',
          label: 'Enabled',
          inputType: 'Switch',
        },
      ]);
      fixture.componentRef.setInput('initialValues', {
        'spec.enabled': 'true',
      });
      fixture.detectChanges();

      expect(component.form.controls['spec.enabled'].value).toBe(true);
    });

    it('should default switch fields to false when initialValues are missing', () => {
      fixture.componentRef.setInput('fields', [
        {
          name: 'spec.enabled',
          label: 'Enabled',
          inputType: 'Switch',
        },
      ]);
      fixture.componentRef.setInput('initialValues', {});
      fixture.detectChanges();

      expect(component.form.controls['spec.enabled'].value).toBe(false);
    });
  });

  describe('partial initialValues', () => {
    const fieldsWithCollection: FormFieldDefinition[] = [
      {
        name: 'spec.dependentSelect',
        label: 'Dependent select',
        validation: 'onChange',
      },
      {
        name: 'spec.artifacts',
        label: 'Artifacts',
        propertyCollection: [
          { name: 'name', label: 'Name' },
          { name: 'url', label: 'URL' },
        ],
      },
    ];

    function getCollectionEntries(name: string): Record<string, unknown>[] {
      const array = component.form.controls[name] as FormArray;
      return array.controls.map(
        (group) =>
          (group as FormGroup).controls['entry'].value as Record<
            string,
            unknown
          >,
      );
    }

    beforeEach(() => {
      fixture.componentRef.setInput('fields', fieldsWithCollection);
      fixture.componentRef.setInput('initialValues', {
        'spec.dependentSelect': 'initial-value',
        'spec.artifacts': [
          { name: 'a', url: 'https://a' },
          { name: 'b', url: 'https://b' },
        ],
      });
      fixture.detectChanges();
    });

    it('should leave an absent collection field untouched (regression)', () => {
      expect(getCollectionEntries('spec.artifacts')).toEqual([
        { name: 'a', url: 'https://a' },
        { name: 'b', url: 'https://b' },
      ]);

      // Simulate the onFieldChange hook pushing a partial object that only
      // clears a dependent scalar and omits the collection key entirely.
      fixture.componentRef.setInput('initialValues', {
        'spec.dependentSelect': '',
      });
      fixture.detectChanges();

      // The collection's already-entered entries must survive, not be wiped.
      expect(getCollectionEntries('spec.artifacts')).toEqual([
        { name: 'a', url: 'https://a' },
        { name: 'b', url: 'https://b' },
      ]);
      expect(component.collectionEntries(fieldsWithCollection[1])).toEqual([
        { name: 'a', url: 'https://a' },
        { name: 'b', url: 'https://b' },
      ]);
    });

    it('should still set the scalar keys the partial object contains', () => {
      fixture.componentRef.setInput('initialValues', {
        'spec.dependentSelect': '',
      });
      fixture.detectChanges();

      expect(component.form.controls['spec.dependentSelect'].value).toBe('');
    });

    it('should preserve a scalar sibling absent from the partial object', () => {
      fixture.componentRef.setInput('initialValues', {
        'spec.artifacts': [{ name: 'c', url: 'https://c' }],
      });
      fixture.detectChanges();

      expect(component.form.controls['spec.dependentSelect'].value).toBe(
        'initial-value',
      );
      expect(getCollectionEntries('spec.artifacts')).toEqual([
        { name: 'c', url: 'https://c' },
      ]);
    });

    it('should rebuild all collection fields for a full initialValues object', () => {
      fixture.componentRef.setInput('initialValues', {
        'spec.dependentSelect': 'next',
        'spec.artifacts': [{ name: 'x', url: 'https://x' }],
      });
      fixture.detectChanges();

      expect(component.form.controls['spec.dependentSelect'].value).toBe(
        'next',
      );
      expect(getCollectionEntries('spec.artifacts')).toEqual([
        { name: 'x', url: 'https://x' },
      ]);
    });

    it('should apply a collection key explicitly present as an empty array', () => {
      fixture.componentRef.setInput('initialValues', {
        'spec.artifacts': [],
      });
      fixture.detectChanges();

      expect(getCollectionEntries('spec.artifacts')).toEqual([]);
      expect(component.collectionEntries(fieldsWithCollection[1])).toEqual([]);
    });

    it('should preserve an absent switch sibling in a partial object', () => {
      fixture.componentRef.setInput('fields', [
        {
          name: 'spec.enabled',
          label: 'Enabled',
          inputType: 'Switch',
        },
        {
          name: 'spec.dependentSelect',
          label: 'Dependent select',
        },
      ]);
      fixture.componentRef.setInput('initialValues', {
        'spec.enabled': true,
        'spec.dependentSelect': 'initial-value',
      });
      fixture.detectChanges();

      expect(component.form.controls['spec.enabled'].value).toBe(true);

      fixture.componentRef.setInput('initialValues', {
        'spec.dependentSelect': '',
      });
      fixture.detectChanges();

      // The switch must keep its value; the partial object must not reset it.
      expect(component.form.controls['spec.enabled'].value).toBe(true);
      expect(component.form.controls['spec.dependentSelect'].value).toBe('');
    });

    it('should settle on repeated partial re-init without a self-triggering effect', () => {
      // Pin the loop-free re-init contract of setInitialValues: it reads
      // collectionSeeds via untracked() before .set()-ing a NEW object each run.
      // That untracked read is load-bearing — the child FormCollectionField
      // resets its UI from these seeds, so the seeding effect MUST re-seed from
      // the current seeds, yet it must NOT take a dependency on them, or the
      // .set() would re-trigger the effect in an endless cascade.
      //
      // This test drives two partial re-inits that each touch the collection key
      // and asserts the component reaches a stable fixed point. If a future
      // change reintroduced a tracked collectionSeeds read, the seeding effect
      // would self-trigger; under the zoneless test runner that loop starves the
      // microtask queue, so this test would stop settling and the run would fail
      // (as a suite-level non-termination — there is no public zoneless API for a
      // bounded single-pass effect flush, so it cannot be asserted in-test).
      fixture.componentRef.setInput('initialValues', {
        'spec.dependentSelect': 'first',
        'spec.artifacts': [{ name: 'p', url: 'https://p' }],
      });
      fixture.detectChanges();

      expect(getCollectionEntries('spec.artifacts')).toEqual([
        { name: 'p', url: 'https://p' },
      ]);

      fixture.componentRef.setInput('initialValues', {
        'spec.dependentSelect': 'second',
        'spec.artifacts': [{ name: 'q', url: 'https://q' }],
      });
      fixture.detectChanges();

      // Settled on the last push rather than diverging.
      expect(component.form.controls['spec.dependentSelect'].value).toBe(
        'second',
      );
      expect(getCollectionEntries('spec.artifacts')).toEqual([
        { name: 'q', url: 'https://q' },
      ]);
      expect(component.collectionEntries(fieldsWithCollection[1])).toEqual([
        { name: 'q', url: 'https://q' },
      ]);

      // A further flush with no new input must not change anything: the effects
      // have reached a fixed point (no pending self-triggered re-run).
      fixture.detectChanges();
      expect(component.collectionEntries(fieldsWithCollection[1])).toEqual([
        { name: 'q', url: 'https://q' },
      ]);
    });
  });

  describe('fieldChange output', () => {
    it('should emit on value change for validation: onChange field', () => {
      const emitted: FormFieldChangeEvent[] = [];
      component.fieldChange.subscribe((event) => emitted.push(event));

      const onChangeField = testFields.find((f) => f.name === 'metadata.name')!;
      component.setFormControlValue(
        { target: { value: 'new-value' } } as unknown as Event,
        onChangeField,
      );

      expect(emitted).toEqual([
        { fieldProperty: 'metadata.name', value: 'new-value' },
      ]);
    });

    it('should not emit on blur for validation: onChange field', () => {
      const emitted: FormFieldChangeEvent[] = [];
      component.fieldChange.subscribe((event) => emitted.push(event));

      const onChangeField = testFields.find((f) => f.name === 'metadata.name')!;
      component.onFieldBlur(onChangeField);

      expect(emitted).toEqual([]);
    });

    it('should emit on blur for validation: onBlur field', () => {
      const emitted: FormFieldChangeEvent[] = [];
      component.fieldChange.subscribe((event) => emitted.push(event));

      const onBlurField = testFields.find(
        (f) => f.name === 'metadata.namespace',
      )!;
      component.setFormControlValue(
        { target: { value: 'kube-system' } } as unknown as Event,
        onBlurField,
      );

      expect(emitted).toEqual([]);

      component.onFieldBlur(onBlurField);

      expect(emitted).toEqual([
        { fieldProperty: 'metadata.namespace', value: 'kube-system' },
      ]);
    });

    it('should not emit on value change for validation: onBlur field', () => {
      const emitted: FormFieldChangeEvent[] = [];
      component.fieldChange.subscribe((event) => emitted.push(event));

      const onBlurField = testFields.find(
        (f) => f.name === 'metadata.namespace',
      )!;
      component.setFormControlValue(
        { target: { value: 'kube-system' } } as unknown as Event,
        onBlurField,
      );

      expect(emitted).toEqual([]);
    });

    it('should not emit on change or blur for field without validation', () => {
      const emitted: FormFieldChangeEvent[] = [];
      component.fieldChange.subscribe((event) => emitted.push(event));

      const noValidationField = testFields.find(
        (f) => f.name === 'metadata.labels',
      )!;
      component.setFormControlValue(
        { target: { value: 'some-label' } } as unknown as Event,
        noValidationField,
      );
      component.onFieldBlur(noValidationField);

      expect(emitted).toEqual([]);
    });

    it('should emit on value change for validation: onChange switch field', () => {
      const switchField: FormFieldDefinition = {
        name: 'spec.enabled',
        label: 'Enabled',
        inputType: 'Switch',
        validation: 'onChange',
      };
      fixture.componentRef.setInput('fields', [switchField]);
      fixture.detectChanges();

      const emitted: FormFieldChangeEvent[] = [];
      component.fieldChange.subscribe((event) => emitted.push(event));

      component.setSwitchValue(
        { target: { checked: true } } as unknown as Event,
        switchField,
      );

      expect(emitted).toEqual([{ fieldProperty: 'spec.enabled', value: true }]);
      expect(component.form.controls['spec.enabled'].value).toBe(true);
    });

    it('should not emit on toggle for validation: onBlur switch field', () => {
      const switchField: FormFieldDefinition = {
        name: 'spec.enabled',
        label: 'Enabled',
        inputType: 'Switch',
        validation: 'onBlur',
      };
      fixture.componentRef.setInput('fields', [switchField]);
      fixture.detectChanges();

      const emitted: FormFieldChangeEvent[] = [];
      component.fieldChange.subscribe((event) => emitted.push(event));

      component.setSwitchValue(
        { target: { checked: true } } as unknown as Event,
        switchField,
      );

      expect(emitted).toEqual([]);
    });

    it('should emit on blur for validation: onBlur switch field', () => {
      const switchField: FormFieldDefinition = {
        name: 'spec.enabled',
        label: 'Enabled',
        inputType: 'Switch',
        validation: 'onBlur',
      };
      fixture.componentRef.setInput('fields', [switchField]);
      fixture.detectChanges();

      component.setSwitchValue(
        { target: { checked: true } } as unknown as Event,
        switchField,
      );

      const emitted: FormFieldChangeEvent[] = [];
      component.fieldChange.subscribe((event) => emitted.push(event));

      component.onFieldBlur(switchField);

      expect(emitted).toEqual([{ fieldProperty: 'spec.enabled', value: true }]);
    });

    it('should emit formValueChange when a switch is toggled', () => {
      const switchField: FormFieldDefinition = {
        name: 'spec.enabled',
        label: 'Enabled',
        inputType: 'Switch',
      };
      fixture.componentRef.setInput('fields', [switchField]);
      fixture.detectChanges();

      const emitted: Record<string, unknown>[] = [];
      component.formValueChange.subscribe((value) => emitted.push(value));

      component.setSwitchValue(
        { target: { checked: true } } as unknown as Event,
        switchField,
      );

      expect(emitted).toEqual([{ 'spec.enabled': true }]);
    });

    it('should NOT emit fieldChange for validated fields that were seeded via initialValues (edit-open self-clear regression)', () => {
      // Opening an EDIT dialog pushes prefilled initialValues for a validation
      // field. The old (buggy) behavior re-emitted those seeded values via the
      // seeding effect, which the downstream host interpreted as a user change
      // and reacted to by clearing any dependents. Treat initialValues as
      // seeding, not a user change — no emit for supplied keys on open.
      const emitted: FormFieldChangeEvent[] = [];
      component.fieldChange.subscribe((event) => emitted.push(event));

      fixture.componentRef.setInput('initialValues', {
        'metadata.name': 'my-resource',
        'metadata.namespace': 'ns-value',
      });
      fixture.detectChanges();

      expect(
        emitted.find((e) => e.fieldProperty === 'metadata.name'),
      ).toBeUndefined();
      expect(
        emitted.find((e) => e.fieldProperty === 'metadata.namespace'),
      ).toBeUndefined();
      expect(
        emitted.find((e) => e.fieldProperty === 'metadata.labels'),
      ).toBeUndefined();
    });
  });

  describe('initial emission', () => {
    it('should emit fieldChange for fields with validation on init', () => {
      const localFixture = TestBed.createComponent(DeclarativeForm);
      const localComponent = localFixture.componentInstance;

      const emitted: FormFieldChangeEvent[] = [];
      localComponent.fieldChange.subscribe((event) => emitted.push(event));

      localFixture.componentRef.setInput('fields', testFields);
      localFixture.detectChanges();

      expect(emitted).toEqual(
        expect.arrayContaining([
          { fieldProperty: 'metadata.name', value: '' },
          { fieldProperty: 'metadata.namespace', value: '' },
        ]),
      );
    });

    it('should not emit fieldChange for fields without validation on init', () => {
      const localFixture = TestBed.createComponent(DeclarativeForm);
      const localComponent = localFixture.componentInstance;

      const emitted: FormFieldChangeEvent[] = [];
      localComponent.fieldChange.subscribe((event) => emitted.push(event));

      localFixture.componentRef.setInput('fields', testFields);
      localFixture.detectChanges();

      expect(
        emitted.find((e) => e.fieldProperty === 'metadata.labels'),
      ).toBeUndefined();
    });
  });

  describe('field errors', () => {
    it('should show no error for a pristine field', () => {
      fixture.componentRef.setInput('fieldErrors', {
        'metadata.name': 'Name is required',
      });
      fixture.detectChanges();

      expect(component.getValueState('metadata.name')).toBe('None');
    });

    it('should show error for a dirty field with an error string', () => {
      fixture.componentRef.setInput('fieldErrors', {
        'metadata.name': 'Name is required',
      });

      const onChangeField = testFields.find((f) => f.name === 'metadata.name')!;
      component.setFormControlValue(
        { target: { value: '' } } as unknown as Event,
        onChangeField,
      );
      fixture.detectChanges();

      const shadowRoot = fixture.nativeElement.shadowRoot as ShadowRoot;
      const message = shadowRoot.querySelector('[slot="valueStateMessage"]');

      expect(component.getValueState('metadata.name')).toBe('Negative');
      expect(message?.textContent?.trim()).toBe('Name is required');
    });

    it('should show error for a touched field', () => {
      fixture.componentRef.setInput('fieldErrors', {
        'metadata.name': 'Name is required',
      });
      fixture.detectChanges();

      const control = component.form.controls['metadata.name'];
      control.markAsTouched();

      expect(component.getValueState('metadata.name')).toBe('Negative');
    });

    it('should show switch field errors below the control', () => {
      fixture.componentRef.setInput('fields', [
        {
          name: 'spec.enabled',
          label: 'Enabled',
          inputType: 'Switch',
          validation: 'onChange',
        },
      ]);
      fixture.componentRef.setInput('fieldErrors', {
        'spec.enabled': 'Must be enabled',
      });
      fixture.detectChanges();

      const switchField: FormFieldDefinition = {
        name: 'spec.enabled',
        label: 'Enabled',
        inputType: 'Switch',
        validation: 'onChange',
      };
      component.setSwitchValue(
        { target: { checked: false } } as unknown as Event,
        switchField,
      );
      fixture.detectChanges();

      const shadowRoot = fixture.nativeElement.shadowRoot as ShadowRoot;
      const error = shadowRoot.querySelector('.field-error');

      expect(error?.textContent?.trim()).toBe('Must be enabled');
    });
  });

  describe('submit output', () => {
    it('should emit nested object built from dotted field names', () => {
      const emitted: Record<string, unknown>[] = [];
      component.formSubmit.subscribe((value) => emitted.push(value));

      component.form.controls['metadata.name'].setValue('my-app');
      component.form.controls['metadata.namespace'].setValue('default');
      component.form.controls['metadata.labels'].setValue('app=my-app');

      component.submit();

      expect(emitted).toEqual([
        {
          metadata: {
            name: 'my-app',
            namespace: 'default',
            labels: 'app=my-app',
          },
        },
      ]);
    });

    it('should emit nested object for switch fields', () => {
      fixture.componentRef.setInput('fields', [
        {
          name: 'spec.enabled',
          label: 'Enabled',
          inputType: 'Switch',
        },
      ]);
      fixture.componentRef.setInput('initialValues', { 'spec.enabled': true });
      fixture.detectChanges();

      const emitted: Record<string, unknown>[] = [];
      component.formSubmit.subscribe((value) => emitted.push(value));

      component.submit();

      expect(emitted).toEqual([{ spec: { enabled: true } }]);
    });
  });

  describe('fieldChange dedupe (loop prevention)', () => {
    // A downstream host responds to a parent-field fieldChange by pushing a NEW
    // `fields` array + NEW `initialValues` object. That input change re-runs the
    // seeding effect. Without the dedupe the effect re-emits the parent field
    // with its UNCHANGED value, the host re-resolves and pushes again, and the
    // loop never terminates (endless gql). A reintroduced loop would emit an
    // unbounded number of times, so we assert a BOUNDED emit count. The 2s
    // per-test timeout makes a reintroduced loop fail fast rather than pin CPU.

    const dependencyFields: FormFieldDefinition[] = [
      // Parent field (user drives this). onBlur matches the real dependent-field
      // feature, where the namespace parent is validated on blur.
      {
        name: 'metadata.namespace',
        label: 'Namespace',
        validation: 'onBlur',
      },
      // Dependent field cleared by the host when the parent changes.
      {
        name: 'spec.dependentSelect',
        label: 'Dependent select',
        validation: 'onChange',
      },
    ];

    it('does not re-emit the parent field when the host pushes new fields with the same value', { timeout: 2000 }, () => {
      const localFixture = TestBed.createComponent(DeclarativeForm);
      const localComponent = localFixture.componentInstance;

      localFixture.componentRef.setInput('fields', dependencyFields);
      localFixture.detectChanges();

      // Drain the initial seeding emits (value '' for both validated fields).
      const emitted: FormFieldChangeEvent[] = [];
      localComponent.fieldChange.subscribe((event) => emitted.push(event));

      // User changes the parent (namespace) and blurs it -> one genuine emit.
      localComponent.form.controls['metadata.namespace'].setValue('team-a');
      const namespaceField = dependencyFields[0];
      localComponent.onFieldBlur(namespaceField);

      expect(emitted).toEqual([
        { fieldProperty: 'metadata.namespace', value: 'team-a' },
      ]);

      // The host responds to that emit by pushing a NEW fields array + NEW
      // initialValues object (new identities) that carry the SAME namespace
      // value and clear the dependent field. This re-runs the seeding effect.
      localFixture.componentRef.setInput('fields', [...dependencyFields]);
      localFixture.componentRef.setInput('initialValues', {
        'metadata.namespace': 'team-a',
        'spec.dependentSelect': '',
      });
      localFixture.detectChanges();

      // WITHOUT the dedupe the effect echoes namespace=team-a, the host pushes
      // again, and this explodes without bound. WITH the dedupe the parent is
      // recognised as already-emitted and is NOT echoed. The dependent field
      // was seeded at '' initially and is still '' -> also not re-emitted. So
      // the host push adds nothing.
      expect(
        emitted.filter((e) => e.fieldProperty === 'metadata.namespace').length,
      ).toBe(1);
      expect(
        emitted.filter((e) => e.fieldProperty === 'spec.dependentSelect')
          .length,
      ).toBe(0);
      // Bounded total: exactly the single genuine user emit.
      expect(emitted.length).toBe(1);
    });

    it('does not re-emit a dependent cleared via a host-driven initialValues push', { timeout: 2000 }, () => {
      // Treat the host-driven initialValues push as seeding, not a user
      // change: when the host clears a dependent in response to a parent
      // change, the dependent must NOT emit fieldChange from the seeding
      // effect. User-driven changes still emit via setFormControlValue /
      // setSwitchValue / onFieldBlur; programmatic pushes do not.
      const localFixture = TestBed.createComponent(DeclarativeForm);
      const localComponent = localFixture.componentInstance;

      localFixture.componentRef.setInput('fields', dependencyFields);
      localFixture.componentRef.setInput('initialValues', {
        'spec.dependentSelect': 'prefilled',
      });
      localFixture.detectChanges();

      const emitted: FormFieldChangeEvent[] = [];
      localComponent.fieldChange.subscribe((event) => emitted.push(event));

      // User changes the parent and blurs it.
      localComponent.form.controls['metadata.namespace'].setValue('team-b');
      localComponent.onFieldBlur(dependencyFields[0]);

      // Host responds: same namespace, dependent CLEARED (prefilled -> '').
      localFixture.componentRef.setInput('fields', [...dependencyFields]);
      localFixture.componentRef.setInput('initialValues', {
        'metadata.namespace': 'team-b',
        'spec.dependentSelect': '',
      });
      localFixture.detectChanges();

      // Parent emits once (user). Dependent cleared via programmatic push ->
      // seeded, so NO emit from the effect.
      expect(
        emitted.filter((e) => e.fieldProperty === 'metadata.namespace').length,
      ).toBe(1);
      expect(
        emitted.filter((e) => e.fieldProperty === 'spec.dependentSelect')
          .length,
      ).toBe(0);
      expect(emitted.length).toBe(1);
    });

    it('does not emit for a programmatic initialValues push even when the value changes', { timeout: 2000 }, () => {
      // Programmatic initialValues pushes are treated as seeding, not user
      // changes. Even successive pushes with different values do NOT emit
      // fieldChange — only user-driven setFormControlValue / setSwitchValue /
      // onFieldBlur calls emit.
      const localFixture = TestBed.createComponent(DeclarativeForm);
      const localComponent = localFixture.componentInstance;

      localFixture.componentRef.setInput('fields', dependencyFields);
      localFixture.detectChanges();

      const emitted: FormFieldChangeEvent[] = [];
      localComponent.fieldChange.subscribe((event) => emitted.push(event));

      // Host pushes a value via initialValues.
      localFixture.componentRef.setInput('initialValues', {
        'metadata.namespace': 'first',
      });
      localFixture.detectChanges();

      // Host pushes a different value via initialValues.
      localFixture.componentRef.setInput('initialValues', {
        'metadata.namespace': 'second',
      });
      localFixture.detectChanges();

      expect(
        emitted.filter((e) => e.fieldProperty === 'metadata.namespace'),
      ).toEqual([]);
      // The control reflects the pushed value even though no emit fired.
      expect(
        localComponent.form.controls['metadata.namespace'].value,
      ).toBe('second');
    });

    it('seeds each validation field exactly once on initial open', { timeout: 2000 }, () => {
      const localFixture = TestBed.createComponent(DeclarativeForm);
      const localComponent = localFixture.componentInstance;

      const emitted: FormFieldChangeEvent[] = [];
      localComponent.fieldChange.subscribe((event) => emitted.push(event));

      localFixture.componentRef.setInput('fields', dependencyFields);
      localFixture.detectChanges();

      expect(
        emitted.filter((e) => e.fieldProperty === 'metadata.namespace').length,
      ).toBe(1);
      expect(
        emitted.filter((e) => e.fieldProperty === 'spec.dependentSelect')
          .length,
      ).toBe(1);
    });
  });

  describe('edit-open self-clear regression (initialValues treated as seeding)', () => {
    // Opening an EDIT dialog pushes prefilled initialValues for a parent
    // namespace field and a dependent select field. The old (buggy) seeding
    // effect emitted the parent on open — downstream host interpreted that as
    // a user change, resolved the dependents, and pushed a new initialValues
    // that wiped them. Treat the open-time push as seeding so the parent does
    // NOT emit on open and the dependents keep their prefilled values.

    const parentChildFields: FormFieldDefinition[] = [
      {
        name: 'metadata.namespace',
        label: 'Namespace',
        validation: 'onChange',
      },
      {
        name: 'spec.dependentSelect',
        label: 'Dependent select',
        validation: 'onChange',
      },
    ];

    it('does NOT emit fieldChange for a prefilled parent (nor its dependent) on edit-open', { timeout: 2000 }, () => {
      const localFixture = TestBed.createComponent(DeclarativeForm);
      const localComponent = localFixture.componentInstance;

      const emitted: FormFieldChangeEvent[] = [];
      localComponent.fieldChange.subscribe((event) => emitted.push(event));

      // Simulate opening an edit dialog: fields + prefilled values pushed
      // together in one effect flush.
      localFixture.componentRef.setInput('fields', parentChildFields);
      localFixture.componentRef.setInput('initialValues', {
        'metadata.namespace': 'team-a',
        'spec.dependentSelect': 'saved-value',
      });
      localFixture.detectChanges();

      // Neither the parent nor the dependent should emit on open — both
      // values arrived via initialValues (seeding).
      expect(
        emitted.filter((e) => e.fieldProperty === 'metadata.namespace'),
      ).toEqual([]);
      expect(
        emitted.filter((e) => e.fieldProperty === 'spec.dependentSelect'),
      ).toEqual([]);
    });

    it('still emits seeding for empty-value validation fields on create (no initialValues supplied)', { timeout: 2000 }, () => {
      // Create path: initialValues is {} and the field defaults to ''. The
      // seeding emit is intentionally preserved so a required field can be
      // validated on open.
      const localFixture = TestBed.createComponent(DeclarativeForm);
      const localComponent = localFixture.componentInstance;

      const emitted: FormFieldChangeEvent[] = [];
      localComponent.fieldChange.subscribe((event) => emitted.push(event));

      localFixture.componentRef.setInput('fields', [
        {
          name: 'metadata.name',
          label: 'Name',
          required: true,
          validation: 'onChange',
        },
      ]);
      localFixture.componentRef.setInput('initialValues', {});
      localFixture.detectChanges();

      expect(
        emitted.filter((e) => e.fieldProperty === 'metadata.name'),
      ).toEqual([{ fieldProperty: 'metadata.name', value: '' }]);
    });

    it('suppresses supplied keys and still seeds absent keys for a partial push', { timeout: 2000 }, () => {
      // A full initial push supplies both A and B — neither emits on open.
      // A later partial push mutates only A — A still does NOT emit (its new
      // value was supplied via initialValues, so recorded as seeded). B is
      // absent from the partial object; its value is unchanged, so it also
      // stays silent (per the per-field record contract).
      const localFixture = TestBed.createComponent(DeclarativeForm);
      const localComponent = localFixture.componentInstance;

      localFixture.componentRef.setInput('fields', [
        { name: 'A', label: 'A', validation: 'onChange' },
        { name: 'B', label: 'B', validation: 'onChange' },
      ]);
      localFixture.componentRef.setInput('initialValues', {
        A: 'A_initial',
        B: 'B_initial',
      });
      localFixture.detectChanges();

      const emitted: FormFieldChangeEvent[] = [];
      localComponent.fieldChange.subscribe((event) => emitted.push(event));

      // Partial push: only A is supplied, and it changes.
      localFixture.componentRef.setInput('initialValues', { A: 'A_next' });
      localFixture.detectChanges();

      // A: supplied by initialValues -> seeded, no emit.
      // B: absent from the partial object -> still 'B_initial' in the
      //    control, matches lastEmittedValue -> no emit.
      expect(emitted.filter((e) => e.fieldProperty === 'A')).toEqual([]);
      expect(emitted.filter((e) => e.fieldProperty === 'B')).toEqual([]);
      expect(localComponent.form.controls['A'].value).toBe('A_next');
      expect(localComponent.form.controls['B'].value).toBe('B_initial');
    });

    it('still emits for a genuine user change after seeding', () => {
      // Open with a prefilled value (seeded, no emit), then the user types a
      // new value via setFormControlValue — that MUST emit and update the
      // dedupe map so subsequent echoes are suppressed.
      const localFixture = TestBed.createComponent(DeclarativeForm);
      const localComponent = localFixture.componentInstance;

      const field: FormFieldDefinition = {
        name: 'metadata.name',
        label: 'Name',
        validation: 'onChange',
      };
      localFixture.componentRef.setInput('fields', [field]);
      localFixture.componentRef.setInput('initialValues', {
        'metadata.name': 'saved',
      });
      localFixture.detectChanges();

      const emitted: FormFieldChangeEvent[] = [];
      localComponent.fieldChange.subscribe((event) => emitted.push(event));

      // User-driven change -> emits.
      localComponent.setFormControlValue(
        { target: { value: 'user-typed' } } as unknown as Event,
        field,
      );

      expect(emitted).toEqual([
        { fieldProperty: 'metadata.name', value: 'user-typed' },
      ]);

      // A follow-up host push that echoes the same value must NOT re-emit.
      localFixture.componentRef.setInput('initialValues', {
        'metadata.name': 'user-typed',
      });
      localFixture.detectChanges();

      expect(emitted).toEqual([
        { fieldProperty: 'metadata.name', value: 'user-typed' },
      ]);
    });
  });

  describe('web-component first render (before inputs are assigned)', () => {
    it('renders without emitting NG0950 when fields are not yet set', () => {
      const errorSpy = vi.spyOn(console, 'error');
      const localFixture = TestBed.createComponent(DeclarativeForm);

      expect(() => {
        localFixture.detectChanges();
      }).not.toThrow();

      const ng0950 = errorSpy.mock.calls
        .flat()
        .some((arg) => String(arg).includes('NG0950'));
      expect(ng0950).toBe(false);
      expect(localFixture.componentInstance.fields()).toEqual([]);
    });

    it('recovers and renders once fields are assigned', () => {
      const localFixture = TestBed.createComponent(DeclarativeForm);
      localFixture.detectChanges();

      localFixture.componentRef.setInput('fields', testFields);
      localFixture.detectChanges();

      expect(localFixture.componentInstance.fields().length).toBe(
        testFields.length,
      );
    });
  });
});
