import getpass
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.password_validation import validate_password
from core.models import User


class Command(BaseCommand):
    help = 'Create initial administrator interactively; existing users are never overwritten.'

    def add_arguments(self, parser):
        parser.add_argument('--username', default='admin')

    def handle(self, *args, **options):
        username = options['username']
        if User.objects.filter(username=username).exists():
            raise CommandError('Username already exists.')
        raw = getpass.getpass('Initial password: ')
        if raw != getpass.getpass('Confirm password: '):
            raise CommandError('Passwords differ.')
        user = User(username=username, role='admin', must_change_password=True)
        validate_password(raw, user)
        user.set_password(raw)
        user.save()
        self.stdout.write(self.style.SUCCESS('Administrator created; password change required on first login.'))
