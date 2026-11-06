<template>

<div id="wrapper" class="w-100 h-100 d-flex align-items-center justify-content-center bg-dark " >
    <div id="container" class="fadeinfast text-center">
        <div class="p-3 text-white">
            <img src="/img/svg/shield-lock.svg" class="white" width="128" height="128" ><br><br>
            <span class="fs-4 align-middle">{{ $t("lock.title") }}</span><br>
            <span class="fs-6 text-secondary">{{ $t("lock.info") }}</span>
        </div>
    </div>
</div>
 

</template>


<script setup>
</script>

<style>
    body{ background-color : #212529 !important; }
    #wrapper {background-color: #212529 !important; }
       
</style>
