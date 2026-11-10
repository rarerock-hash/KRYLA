from django.contrib import admin
from .models import Category, Drone, HangarItem


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "slug")
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Drone)
class DroneAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "manufacturer",
        "category",
        "price",
        "owner",
        "is_available",
        "created_at",
    )
    list_filter = ("category", "is_available", "created_at")
    search_fields = ("name", "manufacturer", "description")
    list_editable = ("is_available",)
    readonly_fields = ("created_at",)
    list_per_page = 20


@admin.register(HangarItem)
class HangarItemAdmin(admin.ModelAdmin):
    list_display = (
        "owner",
        "drone",
        "status",
        "added_at",
    )
    list_filter = ("status", "added_at")
    search_fields = (
        "owner__username",
        "drone__name",
    )
    readonly_fields = ("added_at",)
    list_per_page = 20