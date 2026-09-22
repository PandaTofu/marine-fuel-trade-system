from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import User, Reference, Audit, Company, LoginGuard


class FoundationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.raw = 'Marine-Test!2026'
        cls.owner = User.objects.create_user(username='owner', password=cls.raw, role='admin', must_change_password=False)
        cls.operator = User.objects.create_user(username='operator', password=cls.raw, must_change_password=False)
        cls.new = User.objects.create_user(username='newadmin', password=cls.raw, role='admin')

    def client_for(self, name='owner'):
        c = APIClient(enforce_csrf_checks=True)
        token = c.get('/api/auth/csrf/').json()['csrfToken']
        response = c.post('/api/auth/login/', {'username': name, 'password': self.raw}, format='json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 200)
        self.csrf(c)
        return c

    def csrf(self, c):
        c.credentials(HTTP_X_CSRFTOKEN=c.get('/api/auth/csrf/').json()['csrfToken'])

    def test_anonymous_endpoints_are_protected(self):
        c = APIClient()
        for path in ['users/', 'reference/', 'company/', 'overview/', 'auth/me/']:
            self.assertEqual(c.get('/api/' + path).status_code, 403, path)

    def test_login_csrf_and_mutation_csrf(self):
        c = APIClient(enforce_csrf_checks=True)
        self.assertEqual(c.post('/api/auth/login/', {'username': 'owner', 'password': self.raw}).status_code, 403)
        c = self.client_for()
        c.credentials()
        self.assertEqual(c.patch('/api/company/', {'name':'bad'}, format='json').status_code, 403)

    def test_initial_password_gate_and_hash(self):
        c = self.client_for('newadmin')
        self.assertEqual(c.get('/api/company/').json()['code'], 'password_change_required')
        self.assertEqual(c.post('/api/auth/password/', {'current_password': self.raw, 'password':'Short'}, format='json').status_code, 400)
        self.assertEqual(c.post('/api/auth/password/', {'current_password': self.raw, 'password':'Ocean-New!2026'}, format='json').status_code, 200)
        self.csrf(c)
        self.assertEqual(c.get('/api/company/').status_code, 200)
        self.new.refresh_from_db()
        self.assertTrue(self.new.password.startswith('bcrypt_sha256$'))
        self.assertFalse(self.new.must_change_password)

    def test_five_failures_lock_and_expire(self):
        c = APIClient(enforce_csrf_checks=True)
        self.csrf(c)
        for n in range(5):
            response = c.post('/api/auth/login/', {'username':'owner','password':'bad'}, format='json')
            self.assertEqual(response.status_code, 429 if n == 4 else 400)
        self.assertEqual(c.post('/api/auth/login/', {'username':'owner','password':self.raw}, format='json').status_code, 429)
        LoginGuard.objects.update(locked_until=timezone.now()-timedelta(seconds=1))
        self.assertEqual(c.post('/api/auth/login/', {'username':'owner','password':self.raw}, format='json').status_code, 200)

    def test_idle_expiry_and_activity(self):
        c = self.client_for()
        session = c.session
        session['activity'] = timezone.now().timestamp() - 1799
        session.save()
        self.assertEqual(c.post('/api/auth/activity/', {}, format='json').status_code, 200)
        self.assertLess(timezone.now().timestamp()-c.session['activity'], 5)
        session = c.session
        session['activity'] = timezone.now().timestamp() - 1800
        session.save()
        self.assertEqual(c.get('/api/overview/').json()['code'], 'session_expired')
        self.assertEqual(c.post('/api/auth/activity/', {}, format='json').status_code, 403)

    def test_reads_do_not_refresh_idle_timeout(self):
        c = self.client_for()
        before = c.session['activity']
        c.get('/api/overview/')
        self.assertEqual(before, c.session['activity'])

    def test_operator_cannot_manage_users_or_company(self):
        c = self.client_for('operator')
        self.assertEqual(c.get('/api/users/').status_code, 403)
        self.assertEqual(c.post('/api/users/', {'username':'intruder','password':self.raw,'role':'admin'}, format='json').status_code, 403)
        self.assertEqual(c.patch('/api/company/', {'name':'bad'}, format='json').status_code, 403)
        self.assertEqual(c.get('/api/company/').status_code, 200)

    def test_disable_and_reenable_revokes_old_session(self):
        operator = self.client_for('operator')
        admin = self.client_for()
        url = f'/api/users/{self.operator.pk}/'
        self.assertEqual(admin.patch(url, {'is_active':False}, format='json').status_code, 200)
        self.assertEqual(operator.get('/api/company/').status_code, 403)
        admin.patch(url, {'is_active':True}, format='json')
        self.assertEqual(operator.get('/api/company/').status_code, 403)

    def test_self_admin_protection(self):
        c = self.client_for()
        for values in [{'is_active':False},{'role':'operator'}]:
            self.assertEqual(c.patch(f'/api/users/{self.owner.pk}/',values,format='json').status_code,400)

    def test_create_reset_and_duplicate_user(self):
        c = self.client_for()
        payload = {'username':'newoperator','password':self.raw,'role':'operator'}
        response = c.post('/api/users/',payload,format='json')
        self.assertEqual(response.status_code,201)
        self.assertTrue(response.json()['must_change_password'])
        self.assertNotIn('password',response.json())
        self.assertEqual(c.post('/api/users/',payload,format='json').status_code,400)
        op = self.client_for('operator')
        self.assertEqual(c.post(f'/api/users/{self.operator.pk}/reset-password/',{'password':'Reset-Marine!2026'},format='json').status_code,200)
        self.assertEqual(op.get('/api/company/').status_code,403)

    def test_all_reference_kinds_persist_filter_and_deactivate(self):
        c = self.client_for('operator')
        for kind,_ in Reference.KINDS:
            response = c.post('/api/reference/',{'kind':kind,'name':'测试资料'},format='json')
            self.assertEqual(response.status_code,201)
            pk = response.json()['id']
            self.assertRegex(response.json()['code'], r'^[A-Z]{3}-\d{6}$')
            self.assertEqual(c.get('/api/reference/?kind='+kind).json()[0]['id'],pk)
            self.assertEqual(c.patch(f'/api/reference/{pk}/',{'is_active':False},format='json').status_code,200)
            self.assertFalse(Reference.objects.get(pk=pk).is_active)
            self.assertEqual(c.delete(f'/api/reference/{pk}/').status_code,405)
        self.assertEqual(Reference.objects.count(),5)
        self.assertEqual(Audit.objects.filter(action='reference_created').count(),5)

    def test_duplicate_reference_and_validation(self):
        c = self.client_for()
        payload={'kind':'oil','name':'MGO'}
        self.assertEqual(c.post('/api/reference/',payload,format='json').status_code,201)
        self.assertEqual(c.post('/api/reference/',payload,format='json').status_code,400)
        self.assertEqual(c.post('/api/reference/',{'kind':'unknown','name':'x'},format='json').status_code,400)

    def test_audit_failure_rolls_back_reference(self):
        c = self.client_for()
        with patch('core.views.audit',side_effect=RuntimeError('test atomic rollback')):
            with self.assertRaises(RuntimeError):
                c.post('/api/reference/',{'kind':'oil','name':'Rollback'},format='json')
        self.assertFalse(Reference.objects.filter(name='Rollback').exists())

    def test_company_and_language_persistence(self):
        c = self.client_for()
        self.assertEqual(c.patch('/api/company/',{'name':'测试公司','invoice_prefix':'BD'},format='json').status_code,200)
        self.assertEqual(Company.objects.get(pk=1).name,'测试公司')

    def test_company_invoice_defaults(self):
        company = Company()
        self.assertEqual(company.name, 'Bond Shipping and Trading Limited')
        self.assertEqual(company.email, 'bunker@bond-shipping.com')
        self.assertIn('HANGWAI IND CTR', company.address)
        self.assertEqual(c.post('/api/auth/language/',{'language':'en'},format='json').status_code,200)
        self.assertEqual(c.get('/api/auth/me/').json()['language'],'en')
        self.assertEqual(c.post('/api/auth/language/',{'language':'invalid'},format='json').status_code,400)
        self.assertEqual(c.post('/api/auth/logout/',{},format='json').status_code,200)
        self.assertEqual(c.get('/api/company/').status_code,403)
