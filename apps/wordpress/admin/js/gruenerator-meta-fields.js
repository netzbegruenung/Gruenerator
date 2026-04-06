/**
 * Media picker for the contact background image meta box.
 *
 * @package Gruenerator
 */
(function ($) {
  'use strict';

  $(document).ready(function () {
    $('#gruenerator_contact_background_button').on('click', function (e) {
      e.preventDefault();
      var image = wp
        .media({
          title: grueneratorMetaFields.chooseImage,
          multiple: false,
        })
        .open()
        .on('select', function () {
          var uploaded_image = image.state().get('selection').first();
          var image_url = uploaded_image.toJSON().url;
          $('#gruenerator_contact_background').val(image_url);
        });
    });
  });
})(jQuery);
