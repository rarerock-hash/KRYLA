
from django.urls import path
from django.contrib.auth import views as auth_views

from . import views


app_name = "drones"


urlpatterns = [

    # ==========================================
    # HOME
    # ==========================================

    path(
        "",
        views.home,
        name="home"
    ),

    # ==========================================
    # FLIGHT SIMULATOR
    # ==========================================

    path(
        "simulator/",
        views.simulator,
        name="simulator"
    ),

    # ==========================================
    # DRONE CATALOG
    # ==========================================

    path(
        "drones/",
        views.drone_list,
        name="drone_list"
    ),

    # ==========================================
    # DRONE COMPARISON
    # ==========================================

    path(
        "compare/",
        views.compare_drones,
        name="compare_drones"
    ),

    # ==========================================
    # PROFILE
    # ==========================================

    path(
        "profile/",
        views.profile,
        name="profile"
    ),

    # ==========================================
    # ANALYTICS
    # ==========================================

    path(
        "analytics/",
        views.analytics,
        name="analytics"
    ),

    # ==========================================
    # MY HANGAR
    # ==========================================

    path(
        "hangar/",
        views.my_hangar,
        name="my_hangar"
    ),

    path(
        "hangar/add/<int:drone_id>/",
        views.add_to_hangar,
        name="add_to_hangar"
    ),

    path(
        "hangar/edit/<int:item_id>/",
        views.edit_hangar_item,
        name="edit_hangar_item"
    ),

    path(
        "hangar/delete/<int:item_id>/",
        views.delete_hangar_item,
        name="delete_hangar_item"
    ),

    # ==========================================
    # SHOPPING CART
    # ==========================================

    path(
        "cart/add/<int:drone_id>/",
        views.add_to_cart,
        name="add_to_cart"
    ),

    path(
        "cart/update/<int:item_id>/",
        views.update_cart_item,
        name="update_cart_item"
    ),

    path(
        "cart/remove/<int:item_id>/",
        views.remove_cart_item,
        name="remove_cart_item"
    ),

    # ==========================================
    # CHECKOUT
    # ==========================================

    path(
        "checkout/",
        views.checkout,
        name="checkout"
    ),

    # ==========================================
    # ORDER CONFIRMATION
    # ==========================================

    path(
        "order/success/<int:order_id>/",
        views.order_success,
        name="order_success"
    ),

    # ==========================================
    # MY ORDERS — ORDER HISTORY
    # ==========================================

    path(
        "orders/",
        views.my_orders,
        name="my_orders"
    ),

    # ==========================================
    # AUTHENTICATION
    # ==========================================

    path(
        "register/",
        views.register,
        name="register"
    ),

    path(
        "login/",
        auth_views.LoginView.as_view(
            template_name="drones/login.html",
            next_page="drones:home"
        ),
        name="login"
    ),

    path(
        "logout/",
        auth_views.LogoutView.as_view(
            next_page="drones:home"
        ),
        name="logout"
    ),
]
