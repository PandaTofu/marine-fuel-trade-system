from django.db import migrations, models
from django.db.models import Q


def keep_one_default(apps, schema_editor):
    Account = apps.get_model('trading', 'Account')
    defaults = list(Account.objects.filter(is_default=True).order_by('id'))
    if len(defaults) <= 1:
        return
    preferred = next((row for row in defaults if row.currency == 'USD'), defaults[0])
    Account.objects.filter(is_default=True).exclude(pk=preferred.pk).update(is_default=False)


class Migration(migrations.Migration):
    dependencies = [('trading', '0007_account_type_and_currencies')]

    operations = [
        migrations.RemoveConstraint(
            model_name='account',
            name='trading_default_currency',
        ),
        migrations.RunPython(keep_one_default, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='account',
            constraint=models.UniqueConstraint(
                fields=('is_default',),
                condition=Q(is_default=True),
                name='trading_single_default_account',
            ),
        ),
    ]
