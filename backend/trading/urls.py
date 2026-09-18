from django.urls import path
from . import views

urlpatterns = [
    path('orders/',views.orders),
    path('orders/options/',views.options),
    path('orders/clear-snapshot/',views.clear_snapshot),
    path('orders/bulk-delete/',views.bulk_delete),
    path('orders/<int:pk>/',views.order_detail),
    path('orders/<int:pk>/invoice/',views.order_document,{'kind':'invoice'}),
    path('orders/<int:pk>/contract/',views.order_document,{'kind':'contract'}),
    path('orders/<int:pk>/settlement/',views.settlement),
    path('orders/<int:pk>/refund/',views.order_refund),
    path('orders/<int:pk>/history/',views.order_history),
    path('orders/<int:pk>/delete/',views.order_close,{'action':'delete'}),
    path('orders/<int:pk>/void/',views.order_close,{'action':'void'}),
    path('accounts/',views.accounts),
    path('accounts/<int:pk>/',views.account_detail),
    path('ledger/',views.ledger),
    path('ledger/export/',views.ledger_export),
    path('ledger/<int:pk>/reverse/',views.ledger_reverse),
    path('dashboard/',views.dashboard),
]
