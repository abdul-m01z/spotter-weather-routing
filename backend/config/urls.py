from django.urls import path
from routing import views

urlpatterns = [path("api/places", views.places), path("api/compare", views.compare)]
