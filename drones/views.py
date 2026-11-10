
from decimal import Decimal

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.db import transaction
from django.db.models import Q, Count, Avg, Min, Max
from django.http import HttpResponseRedirect
from django.urls import reverse

from .models import (
    Drone,
    HangarItem,
    Category,
    CartItem,
    Order,
    OrderItem,
)
from .forms import RegisterForm, HangarItemForm, CheckoutForm


# ==========================================
# HOME
# ==========================================

def home(request):
    return render(request, "drones/home.html")


# ==========================================
# FLIGHT SIMULATOR
# ==========================================

def simulator(request):
    return render(request, "drones/simulator.html")


# ==========================================
# DRONE CATALOG
# ==========================================

def drone_list(request):
    drones = Drone.objects.select_related(
        "category", "owner"
    ).all()

    categories = Category.objects.all()

    search = request.GET.get("search", "").strip()

    if search:
        drones = drones.filter(
            Q(name__icontains=search)
            | Q(manufacturer__icontains=search)
            | Q(description__icontains=search)
        )

    selected_category = request.GET.get("category", "")

    if selected_category:
        drones = drones.filter(
            category__slug=selected_category
        )

    availability = request.GET.get("availability", "")

    if availability == "available":
        drones = drones.filter(is_available=True)
    elif availability == "unavailable":
        drones = drones.filter(is_available=False)

    sort = request.GET.get("sort", "newest")

    sorting_options = {
        "newest": "-created_at",
        "oldest": "created_at",
        "price_asc": "price",
        "price_desc": "-price",
        "name": "name",
        "flight_time": "-flight_time",
    }

    drones = drones.order_by(
        sorting_options.get(sort, "-created_at"),
        "pk"
    )

    return render(request, "drones/drone_list.html", {
        "drones": drones,
        "categories": categories,
        "search": search,
        "selected_category": selected_category,
        "availability": availability,
        "sort": sort,
    })


# ==========================================
# DRONE COMPARISON
# ==========================================

def compare_drones(request):
    all_drones = Drone.objects.select_related(
        "category"
    ).order_by("manufacturer", "name", "pk")

    selected_ids = []

    for raw_id in request.GET.getlist("drone"):
        try:
            drone_id = int(raw_id)
        except (TypeError, ValueError):
            continue

        if drone_id > 0 and drone_id not in selected_ids:
            selected_ids.append(drone_id)

    selected_ids = selected_ids[:3]

    selected_by_id = {
        drone.pk: drone
        for drone in all_drones.filter(pk__in=selected_ids)
    }

    selected_drones = [
        selected_by_id[drone_id]
        for drone_id in selected_ids
        if drone_id in selected_by_id
    ]

    comparison_ready = len(selected_drones) >= 2

    prices = [
        drone.price
        for drone in selected_drones
        if drone.price is not None
    ]

    flight_times = [
        drone.flight_time
        for drone in selected_drones
        if drone.flight_time is not None
    ]

    ranges = [
        drone.range_km
        for drone in selected_drones
        if drone.range_km is not None
    ]

    best_price = min(prices) if prices else None
    best_flight_time = max(flight_times) if flight_times else None
    best_range = max(ranges) if ranges else None

    context = {
        "all_drones": all_drones,
        "selected_drones": selected_drones,
        "selected_ids": selected_ids,
        "comparison_ready": len(selected_drones) >= 2,
        "best_price": best_price,
        "best_flight_time": best_flight_time,
        "best_range": best_range,
    }

    return render(request, "drones/compare.html", context)


# ==========================================
# REGISTRATION
# ==========================================

def register(request):
    if request.user.is_authenticated:
        return redirect("drones:home")

    if request.method == "POST":
        form = RegisterForm(request.POST)

        if form.is_valid():
            user = form.save()
            login(request, user)
            return redirect("drones:home")
    else:
        form = RegisterForm()

    return render(request, "drones/register.html", {
        "form": form,
    })


# ==========================================
# MY PROFILE
# ==========================================

@login_required(login_url="drones:login")
def profile(request):
    user = request.user

    hangar_items = HangarItem.objects.filter(
        owner=user
    ).select_related("drone", "drone__category")

    hangar_count = hangar_items.count()

    recent_items = hangar_items.order_by("-pk")[:4]

    return render(request, "drones/profile.html", {
        "profile_user": user,
        "hangar_count": hangar_count,
        "recent_items": recent_items,
    })


# ==========================================
# ANALYTICS DASHBOARD
# ==========================================

def analytics(request):
    drones = Drone.objects.all()

    total_drones = drones.count()

    available_drones = drones.filter(
        is_available=True
    ).count()

    unavailable_drones = drones.filter(
        is_available=False
    ).count()

    total_categories = Category.objects.count()

    price_statistics = drones.aggregate(
        average_price=Avg("price"),
        minimum_price=Min("price"),
        maximum_price=Max("price"),
    )

    average_price = price_statistics["average_price"] or 0
    minimum_price = price_statistics["minimum_price"] or 0
    maximum_price = price_statistics["maximum_price"] or 0

    category_statistics = list(
        Category.objects.annotate(
            drone_count=Count("drones")
        ).filter(
            drone_count__gt=0
        ).order_by("-drone_count", "name").values(
            "name", "drone_count"
        )
    )

    category_labels = [
        item["name"]
        for item in category_statistics
    ]

    category_values = [
        item["drone_count"]
        for item in category_statistics
    ]

    manufacturer_statistics = list(
        drones.values("manufacturer").annotate(
            drone_count=Count("id")
        ).order_by(
            "-drone_count", "manufacturer"
        )[:8]
    )

    manufacturer_labels = [
        item["manufacturer"]
        for item in manufacturer_statistics
    ]

    manufacturer_values = [
        item["drone_count"]
        for item in manufacturer_statistics
    ]

    availability_percentage = (
        round(available_drones / total_drones * 100, 1)
        if total_drones > 0
        else 0
    )

    flight_statistics = drones.aggregate(
        average_flight_time=Avg("flight_time"),
        maximum_flight_time=Max("flight_time"),
        average_range=Avg("range_km"),
    )

    average_flight_time = (
        flight_statistics["average_flight_time"] or 0
    )

    maximum_flight_time = (
        flight_statistics["maximum_flight_time"] or 0
    )

    average_range = (
        flight_statistics["average_range"] or 0
    )

    context = {
        "total_drones": total_drones,
        "available_drones": available_drones,
        "unavailable_drones": unavailable_drones,
        "total_categories": total_categories,
        "average_price": average_price,
        "minimum_price": minimum_price,
        "maximum_price": maximum_price,
        "category_labels": category_labels,
        "category_values": category_values,
        "manufacturer_labels": manufacturer_labels,
        "manufacturer_values": manufacturer_values,
        "availability_percentage": availability_percentage,
        "average_flight_time": average_flight_time,
        "maximum_flight_time": maximum_flight_time,
        "average_range": average_range,
    }

    return render(request, "drones/analytics.html", context)


# ==========================================
# MY HANGAR + SHOPPING CART
# ==========================================

@login_required(login_url="drones:login")
def my_hangar(request):
    items = HangarItem.objects.filter(
        owner=request.user
    ).select_related("drone", "drone__category")

    cart_items = list(
        CartItem.objects.filter(
            owner=request.user
        ).select_related("drone", "drone__category")
    )

    cart_quantity = sum(
        cart_item.quantity
        for cart_item in cart_items
    )

    cart_total = sum(
        (
            cart_item.total_price
            for cart_item in cart_items
        ),
        Decimal("0.00")
    )

    return render(request, "drones/my_hangar.html", {
        "items": items,
        "cart_items": cart_items,
        "cart_quantity": cart_quantity,
        "cart_total": cart_total,
    })


# ==========================================
# ADD DRONE TO HANGAR
# ==========================================

@login_required(login_url="drones:login")
@require_POST
def add_to_hangar(request, drone_id):
    drone = get_object_or_404(Drone, pk=drone_id)

    HangarItem.objects.get_or_create(
        owner=request.user,
        drone=drone,
    )

    return redirect("drones:my_hangar")


# ==========================================
# EDIT HANGAR ITEM
# ==========================================

@login_required(login_url="drones:login")
def edit_hangar_item(request, item_id):
    item = get_object_or_404(
        HangarItem,
        pk=item_id,
        owner=request.user,
    )

    if request.method == "POST":
        form = HangarItemForm(request.POST, instance=item)

        if form.is_valid():
            form.save()
            return redirect("drones:my_hangar")
    else:
        form = HangarItemForm(instance=item)

    return render(request, "drones/hangar_edit.html", {
        "form": form,
        "item": item,
    })


# ==========================================
# DELETE HANGAR ITEM
# ==========================================

@login_required(login_url="drones:login")
@require_POST
def delete_hangar_item(request, item_id):
    item = get_object_or_404(
        HangarItem,
        pk=item_id,
        owner=request.user,
    )

    item.delete()

    return redirect("drones:my_hangar")


# ==========================================
# SHOPPING CART — ADD PRODUCT
# ==========================================

@login_required(login_url="drones:login")
@require_POST
def add_to_cart(request, drone_id):
    drone = get_object_or_404(
        Drone,
        pk=drone_id,
        is_available=True
    )

    cart_item, created = CartItem.objects.get_or_create(
        owner=request.user,
        drone=drone,
        defaults={"quantity": 1}
    )

    if not created:
        cart_item.quantity += 1
        cart_item.save(update_fields=["quantity"])

    return HttpResponseRedirect(
        reverse("drones:my_hangar") + "#shopping-cart"
    )


# ==========================================
# SHOPPING CART — CHANGE QUANTITY
# ==========================================

@login_required(login_url="drones:login")
@require_POST
def update_cart_item(request, item_id):
    cart_item = get_object_or_404(
        CartItem,
        pk=item_id,
        owner=request.user
    )

    action = request.POST.get("action")

    if action == "increase":
        if cart_item.drone.is_available:
            cart_item.quantity += 1
            cart_item.save(update_fields=["quantity"])

    elif action == "decrease":
        if cart_item.quantity > 1:
            cart_item.quantity -= 1
            cart_item.save(update_fields=["quantity"])
        else:
            cart_item.delete()

    return HttpResponseRedirect(
        reverse("drones:my_hangar") + "#shopping-cart"
    )


# ==========================================
# SHOPPING CART — REMOVE PRODUCT
# ==========================================

@login_required(login_url="drones:login")
@require_POST
def remove_cart_item(request, item_id):
    cart_item = get_object_or_404(
        CartItem,
        pk=item_id,
        owner=request.user
    )

    cart_item.delete()

    return HttpResponseRedirect(
        reverse("drones:my_hangar") + "#shopping-cart"
    )


# ==========================================
# CHECKOUT — CREATE ORDER
# ==========================================

@login_required(login_url="drones:login")
def checkout(request):
    cart_items = list(
        CartItem.objects.filter(
            owner=request.user
        ).select_related("drone")
    )

    if not cart_items:
        return HttpResponseRedirect(
            reverse("drones:my_hangar") + "#shopping-cart"
        )

    cart_total = sum(
        (
            item.total_price
            for item in cart_items
        ),
        Decimal("0.00")
    )

    if request.method == "POST":
        form = CheckoutForm(request.POST)

        if form.is_valid():
            with transaction.atomic():
                locked_cart_items = list(
                    CartItem.objects.select_for_update().filter(
                        owner=request.user
                    ).select_related("drone")
                )

                if not locked_cart_items:
                    return HttpResponseRedirect(
                        reverse("drones:my_hangar") + "#shopping-cart"
                    )

                unavailable_items = [
                    item
                    for item in locked_cart_items
                    if not item.drone.is_available
                ]

                if unavailable_items:
                    form.add_error(
                        None,
                        "Деякі товари більше недоступні. "
                        "Перевірте кошик перед оформленням."
                    )
                else:
                    total_amount = sum(
                        (
                            item.total_price
                            for item in locked_cart_items
                        ),
                        Decimal("0.00")
                    )

                    order = form.save(commit=False)
                    order.owner = request.user
                    order.total_amount = total_amount
                    order.save()

                    order_items = [
                        OrderItem(
                            order=order,
                            drone=item.drone,
                            drone_name=item.drone.name,
                            manufacturer=item.drone.manufacturer,
                            price=item.drone.price,
                            quantity=item.quantity,
                        )
                        for item in locked_cart_items
                    ]

                    OrderItem.objects.bulk_create(order_items)

                    CartItem.objects.filter(
                        pk__in=[
                            item.pk
                            for item in locked_cart_items
                        ]
                    ).delete()

                    return redirect(
                        "drones:order_success",
                        order_id=order.pk
                    )
    else:
        form = CheckoutForm(
            initial={
                "email": request.user.email,
                "full_name": request.user.get_full_name(),
            }
        )

    return render(request, "drones/checkout.html", {
        "form": form,
        "cart_items": cart_items,
        "cart_total": cart_total,
    })


# ==========================================
# ORDER SUCCESS
# ==========================================

@login_required(login_url="drones:login")
def order_success(request, order_id):
    order = get_object_or_404(
        Order.objects.prefetch_related("items"),
        pk=order_id,
        owner=request.user
    )

    return render(request, "drones/order_success.html", {
        "order": order,
    })

# ==========================================
# MY ORDERS — ORDER HISTORY
# ==========================================

@login_required(login_url="drones:login")
def my_orders(request):
    orders = (
        Order.objects
        .filter(owner=request.user)
        .prefetch_related("items")
        .order_by("-created_at")
    )

    total_orders = orders.count()

    total_spent = sum(
        (order.total_amount for order in orders),
        Decimal("0.00")
    )

    return render(request, "drones/my_orders.html", {
        "orders": orders,
        "total_orders": total_orders,
        "total_spent": total_spent,
    })
